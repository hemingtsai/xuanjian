import path from "node:path"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"
import type { LSPManager } from "../lsp/manager"
import { definition, references, documentSymbols, hover, summarizeDiagnostics, formatLocations, uriToPath } from "../lsp/features"

function getManager(ctx: ToolContext): LSPManager | undefined {
  return ctx.extra?.lsp as LSPManager | undefined
}

const PosArgs = z.object({
  file_path: z.string().describe("文件路径"),
  line: z.number().int().describe("行号（0 基）"),
  character: z.number().int().describe("列号（0 基）"),
})

const FileArgs = z.object({
  file_path: z.string().describe("文件路径"),
})

export const LspDefinitionTool: ToolDef = {
  id: "lsp_definition",
  description: "查询符号定义位置（LSP）。",
  parameters: zodToJsonSchema(PosArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(PosArgs, rawArgs)
    const manager = getManager(ctx)
    if (!manager) return { title: "lsp_definition", output: "LSP 不可用" }
    const result = await definition(manager, args.file_path, { line: args.line, character: args.character })
    return { title: `lsp_definition ${args.file_path}`, output: formatLocations(result) || "未找到定义" }
  },
}

export const LspReferencesTool: ToolDef = {
  id: "lsp_references",
  description: "查询符号引用（LSP）。",
  parameters: zodToJsonSchema(PosArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(PosArgs, rawArgs)
    const manager = getManager(ctx)
    if (!manager) return { title: "lsp_references", output: "LSP 不可用" }
    const result = await references(manager, args.file_path, { line: args.line, character: args.character })
    return { title: `lsp_references ${args.file_path}`, output: formatLocations(result) || "未找到引用" }
  },
}

export const LspSymbolsTool: ToolDef = {
  id: "lsp_symbols",
  description: "列出文件中的文档符号（函数/类/变量等）。",
  parameters: zodToJsonSchema(FileArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(FileArgs, rawArgs)
    const manager = getManager(ctx)
    if (!manager) return { title: "lsp_symbols", output: "LSP 不可用" }
    const symbols = await documentSymbols(manager, args.file_path)
    const lines = symbols.map((s) => `  ${s.name}${s.detail ? ` — ${s.detail}` : ""} @${s.range.start.line}:${s.range.start.character}`)
    return { title: `lsp_symbols ${args.file_path}`, output: lines.join("\n") || "无符号" }
  },
}

export const LspHoverTool: ToolDef = {
  id: "lsp_hover",
  description: "查询悬停文档信息（类型/签名/说明）。",
  parameters: zodToJsonSchema(PosArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(PosArgs, rawArgs)
    const manager = getManager(ctx)
    if (!manager) return { title: "lsp_hover", output: "LSP 不可用" }
    const result = await hover(manager, args.file_path, { line: args.line, character: args.character })
    return { title: `lsp_hover ${args.file_path}`, output: result ?? "无信息" }
  },
}

export const LspDiagnosticsTool: ToolDef = {
  id: "lsp_diagnostics",
  description: "获取文件诊断（错误/警告）。",
  parameters: zodToJsonSchema(FileArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(FileArgs, rawArgs)
    const manager = getManager(ctx)
    if (!manager) return { title: "lsp_diagnostics", output: "LSP 不可用" }
    await manager.ensure(args.file_path)
    const diagnostics = manager.getDiagnostics(uriToPath(pathURI(args.file_path)))
    return { title: `lsp_diagnostics ${args.file_path}`, output: summarizeDiagnostics(diagnostics, args.file_path) || "无诊断" }
  },
}

function pathURI(file: string): string {
  return `file://${path.resolve(file)}`
}
