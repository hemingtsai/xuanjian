import type { LSPClient } from "./client"
import type { LSPManager, LSPDiagnostic } from "./manager"
import { pathToURI } from "./manager"

export interface Position {
  line: number
  character: number
}

export interface Location {
  uri: string
  range: { start: Position; end: Position }
}

export interface DocumentSymbol {
  name: string
  kind: number
  detail?: string
  range: { start: Position; end: Position }
  selectionRange: { start: Position; end: Position }
}

function formatRange(r: { start: Position; end: Position }): string {
  return `${r.start.line}:${r.start.character}-${r.end.line}:${r.end.character}`
}

function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) return decodeURIComponent(uri.slice(7))
  return uri
}

export async function definition(manager: LSPManager, file: string, pos: Position): Promise<Location[]> {
  const client = await manager.ensure(file)
  if (!client) return []
  const result = (await client.send("textDocument/definition", {
    textDocument: { uri: pathToURI(file) },
    position: pos,
  })) as Location | Location[] | null
  return normalizeLocations(result)
}

export async function references(manager: LSPManager, file: string, pos: Position): Promise<Location[]> {
  const client = await manager.ensure(file)
  if (!client) return []
  const result = (await client.send("textDocument/references", {
    textDocument: { uri: pathToURI(file) },
    position: pos,
    context: { includeDeclaration: true },
  })) as Location[] | null
  return Array.isArray(result) ? result : []
}

export async function documentSymbols(manager: LSPManager, file: string): Promise<DocumentSymbol[]> {
  const client = await manager.ensure(file)
  if (!client) return []
  const result = (await client.send("textDocument/documentSymbol", { textDocument: { uri: pathToURI(file) } })) as
    | DocumentSymbol[]
    | { name?: string; kind?: number; range?: { start: Position; end: Position }; selectionRange?: { start: Position; end: Position } }[]
    | null
  if (!Array.isArray(result)) return []
  return result.map((s) => ({
    name: String(s.name ?? ""),
    kind: Number(s.kind ?? 0),
    detail: (s as { detail?: string }).detail,
    range: (s as { range?: { start: Position; end: Position } }).range ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    selectionRange: (s as { selectionRange?: { start: Position; end: Position } }).selectionRange ?? { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
  }))
}

export async function hover(manager: LSPManager, file: string, pos: Position): Promise<string | undefined> {
  const client = await manager.ensure(file)
  if (!client) return undefined
  const result = (await client.send("textDocument/hover", {
    textDocument: { uri: pathToURI(file) },
    position: pos,
  })) as { contents?: { value?: string; kind?: string } | string | Array<{ value?: string } | string> } | null
  if (!result?.contents) return undefined
  const contents = result.contents
  if (typeof contents === "string") return contents
  if (Array.isArray(contents)) {
    return contents
      .map((c) => (typeof c === "string" ? c : c.value ?? ""))
      .filter(Boolean)
      .join("\n")
  }
  return contents.value
}

export async function completion(manager: LSPManager, file: string, pos: Position): Promise<string[]> {
  const client = await manager.ensure(file)
  if (!client) return []
  const result = (await client.send("textDocument/completion", {
    textDocument: { uri: pathToURI(file) },
    position: pos,
  })) as { items?: { label?: string }[] } | { label?: string }[] | null
  if (!result) return []
  if (Array.isArray(result)) return result.map((i) => String(i.label ?? "")).filter(Boolean)
  return (result.items ?? []).map((i) => String(i.label ?? "")).filter(Boolean)
}

export async function formatting(manager: LSPManager, file: string): Promise<boolean> {
  const client = await manager.ensure(file)
  if (!client) return false
  const edits = (await client.send("textDocument/formatting", { textDocument: { uri: pathToURI(file) }, options: { tabSize: 2, insertSpaces: true } })) as
    | { range?: { start: Position; end: Position }; newText?: string }[]
    | null
  if (!Array.isArray(edits) || edits.length === 0) return false
  // 应用 edits：简化实现，仅当只有单块全文件替换时生效
  const fs = await import("node:fs")
  const filePath = uriToPath(pathToURI(file))
  const content = fs.readFileSync(filePath, "utf8")
  let next = content
  for (const edit of edits) {
    if (edit.range && edit.newText !== undefined) {
      const lines = next.split("\n")
      const { start, end } = edit.range
      const before = lines.slice(0, start.line)
      const mid = lines.slice(start.line, end.line + 1)
      const after = lines.slice(end.line + 1)
      if (mid.length > 0) {
        mid[0] = mid[0]!.slice(0, start.character)
        mid[mid.length - 1] = mid[mid.length - 1]!.slice(end.character)
      }
      next = [...before, ...mid, edit.newText, ...after].join("\n")
    } else if (edit.newText !== undefined) {
      next = edit.newText
    }
  }
  if (next !== content) {
    fs.writeFileSync(filePath, next, "utf8")
    await manager.didChange(pathToURI(file), next)
    await manager.didSave(pathToURI(file))
    return true
  }
  return false
}

export function summarizeDiagnostics(diagnostics: LSPDiagnostic[], filePath: string): string {
  if (diagnostics.length === 0) return ""
  const lines = diagnostics.slice(0, 20).map((d) => {
    const sev = d.severity === 1 ? "error" : d.severity === 2 ? "warning" : d.severity === 3 ? "info" : "hint"
    const code = d.code !== undefined ? ` [${d.code}]` : ""
    return `${filePath}:${d.range.start.line + 1}:${d.range.start.character + 1} ${sev}${code}: ${d.message}`
  })
  const more = diagnostics.length > 20 ? `\n...另 ${diagnostics.length - 20} 条` : ""
  return lines.join("\n") + more
}

function normalizeLocations(result: Location | Location[] | null): Location[] {
  if (!result) return []
  const list = Array.isArray(result) ? result : [result]
  return list.map((l) => ({ uri: l.uri, range: l.range }))
}

export function formatLocations(locations: Location[]): string {
  return locations.map((l) => `${uriToPath(l.uri)}:${formatRange(l.range)}`).join("\n")
}

export { uriToPath, formatRange }
