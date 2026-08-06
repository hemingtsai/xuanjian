import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"
import { unifiedDiff } from "../util/diff"

const ApplyPatchArgs = z.object({
  patch: z.string().describe(
    "遵循 apply_patch 格式：`*** Begin Patch` / `*** Update File: <path>` / `*** Add File: <path>` / `*** Delete File: <path>` / @@ 块 / `*** End Patch`",
  ),
})

interface Hunk {
  context: string[]
  removed: string[]
  added: string[]
}

interface UpdateSection {
  kind: "update"
  file: string
  hunks: Hunk[]
}

interface AddSection {
  kind: "add"
  file: string
  content: string[]
}

interface DeleteSection {
  kind: "delete"
  file: string
}

type Section = UpdateSection | AddSection | DeleteSection

export function parsePatch(patch: string): Section[] {
  const sections: Section[] = []
  let current: UpdateSection | AddSection | DeleteSection | null = null
  const lines = patch.split("\n")

  const flush = () => {
    current = null
  }

  for (const raw of lines) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw
    if (line.startsWith("*** Begin Patch")) continue
    if (line.startsWith("*** End Patch")) {
      if (current) flush()
      break
    }
    if (line.startsWith("*** Update File: ")) {
      if (current) flush()
      current = { kind: "update", file: line.slice(17).trim(), hunks: [] }
      sections.push(current)
      continue
    }
    if (line.startsWith("*** Add File: ")) {
      if (current) flush()
      current = { kind: "add", file: line.slice(14).trim(), content: [] }
      sections.push(current)
      continue
    }
    if (line.startsWith("*** Delete File: ")) {
      if (current) flush()
      current = { kind: "delete", file: line.slice(17).trim() }
      sections.push(current)
      continue
    }
    if (!current) continue

    if (current.kind === "add") {
      current.content.push(line)
      continue
    }
    if (current.kind === "update") {
      if (line.startsWith("@@")) {
        current.hunks.push({ context: [], removed: [], added: [] })
        continue
      }
      const hunk = current.hunks[current.hunks.length - 1]
      if (!hunk) continue
      if (line.startsWith("-")) hunk.removed.push(line.slice(1))
      else if (line.startsWith("+")) hunk.added.push(line.slice(1))
      else if (line.startsWith(" ")) hunk.context.push(line.slice(1))
      else if (line.trim() === "") hunk.context.push("")
    }
  }
  return sections
}

function applyUpdate(abs: string, sections: UpdateSection[]): string {
  if (sections.length === 0) return ""
  let content = fs.readFileSync(abs, "utf8")
  const file = sections[0]!.file
  for (const section of sections) {
    for (const hunk of section.hunks) {
      const result = applyHunk(content, hunk)
      if (!result) throw new Error(`apply_patch: 无法在 ${file} 中定位 hunk\n上下文: ${hunk.context.slice(0, 3).join(" | ")}`)
      content = result
    }
  }
  return content
}

function applyHunk(content: string, hunk: Hunk): string | undefined {
  const lines = content.split("\n")
  const searchLen = hunk.context.length + hunk.removed.length
  if (searchLen === 0) return content

  // 尝试精确匹配 context+removed
  const pattern = [...hunk.context, ...hunk.removed]
  for (let i = 0; i <= lines.length - pattern.length; i++) {
    let match = true
    for (let j = 0; j < pattern.length; j++) {
      if (lines[i + j] !== pattern[j]) {
        match = false
        break
      }
    }
    if (match) {
      const before = lines.slice(0, i)
      const after = lines.slice(i + pattern.length)
      return [...before, ...hunk.context, ...hunk.added, ...after].join("\n")
    }
  }

  // 降级：仅按首条 context 定位
  if (hunk.context.length > 0) {
    const anchor = hunk.context[0]!
    const idx = lines.indexOf(anchor)
    if (idx !== -1) {
      const before = lines.slice(0, idx)
      const after = lines.slice(idx + hunk.context.length)
      return [...before, ...hunk.context, ...hunk.added, ...after].join("\n")
    }
  }
  return undefined
}

export const ApplyPatchTool: ToolDef = {
  id: "apply_patch",
  description: "用 apply_patch 格式批量修改多个文件（更新/新增/删除）。适合大规模变更。",
  parameters: zodToJsonSchema(ApplyPatchArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(ApplyPatchArgs, rawArgs)
    const sections = parsePatch(args.patch)
    const log: string[] = []
    const updates = sections.filter((s): s is UpdateSection => s.kind === "update")
    const groups = new Map<string, UpdateSection[]>()
    for (const s of updates) {
      const abs = path.isAbsolute(s.file) ? s.file : path.resolve(ctx.cwd, s.file)
      const list = groups.get(abs) ?? []
      list.push(s)
      groups.set(abs, list)
    }
    const diffParts: string[] = []
    for (const [abs, secs] of groups) {
      const before = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : ""
      const next = applyUpdate(abs, secs)
      fs.writeFileSync(abs, next, "utf8")
      const rel = path.relative(ctx.cwd, abs)
      log.push(`更新 ${rel}`)
      const d = unifiedDiff(before, next, rel)
      if (d) diffParts.push(d)
    }
    for (const s of sections) {
      if (s.kind === "add") {
        const abs = path.isAbsolute(s.file) ? s.file : path.resolve(ctx.cwd, s.file)
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        const content = s.content.join("\n") + (s.content.length > 0 ? "\n" : "")
        fs.writeFileSync(abs, content, "utf8")
        const rel = path.relative(ctx.cwd, abs)
        log.push(`新增 ${rel}`)
        const d = unifiedDiff("", content, rel)
        if (d) diffParts.push(d)
      } else if (s.kind === "delete") {
        const abs = path.isAbsolute(s.file) ? s.file : path.resolve(ctx.cwd, s.file)
        if (fs.existsSync(abs)) {
          const before = fs.readFileSync(abs, "utf8")
          const rel = path.relative(ctx.cwd, abs)
          fs.rmSync(abs, { recursive: true })
          log.push(`删除 ${rel}`)
          const d = unifiedDiff(before, "", rel)
          if (d) diffParts.push(d)
        }
      }
    }
    const combined = diffParts.join("\n").trimEnd()
    return {
      title: `apply_patch (${sections.length} 个变更)`,
      output: log.join("\n") || "无变更",
      metadata: combined ? { diff: combined } : undefined,
    }
  },
}
