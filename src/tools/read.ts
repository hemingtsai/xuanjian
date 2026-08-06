import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

const ReadArgs = z.object({
  file_path: z.string().describe("要读取的文件的绝对路径或相对项目路径"),
  offset: z.number().int().optional().describe("起始行号（0 基）"),
  limit: z.number().int().optional().describe("读取行数上限"),
})

export const ReadTool: ToolDef = {
  id: "read",
  description: "读取文件内容。用于理解代码库、查看实现。带行号输出。",
  parameters: zodToJsonSchema(ReadArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(ReadArgs, rawArgs)
    const abs = path.isAbsolute(args.file_path) ? args.file_path : path.resolve(ctx.cwd, args.file_path)
    if (!fs.existsSync(abs)) throw new Error(`文件不存在: ${abs}`)
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(abs).map((name) => (fs.statSync(path.join(abs, name)).isDirectory() ? `${name}/` : name))
      return { title: `读取目录 ${args.file_path}`, output: entries.join("\n") }
    }
    const all = fs.readFileSync(abs, "utf8").split("\n")
    const start = args.offset ?? 0
    const limit = args.limit ?? 2000
    const slice = all.slice(start, limit === Infinity ? undefined : start + limit)
    const width = String(start + slice.length).length
    const lines = slice.map((line, i) => `${String(start + i + 1).padStart(width)}: ${line}`)
    const truncated = start + limit < all.length ? `\n...(共 ${all.length} 行，已截断)` : ""
    const meta = { lines: all.length, size: stat.size, mtime: stat.mtimeMs }
    return { title: `读取 ${args.file_path}`, output: lines.join("\n") + truncated, metadata: meta }
  },
}
