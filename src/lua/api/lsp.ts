import path from "node:path"
import { requireLuaContext } from "./context"
import { definition, documentSymbols, completion } from "../../lsp/features"
import { references as lspReferences } from "../../lsp/features"
import { hover as lspHover } from "../../lsp/features"

export interface LuaPos {
  line: number
  character: number
}

function pos(p: LuaPos): { line: number; character: number } {
  return { line: p.line, character: p.character }
}

export function getSymbols(file: string): Promise<unknown[]> {
  return documentSymbols(requireLuaContext().lsp, file).then((s) => s.map((x) => ({ name: x.name, kind: x.kind, detail: x.detail })))
}

export function definition_(file: string, p: LuaPos): Promise<unknown[]> {
  return definition(requireLuaContext().lsp, file, pos(p))
}

export function references(file: string, p: LuaPos): Promise<unknown[]> {
  return lspReferences(requireLuaContext().lsp, file, pos(p))
}

export function hover(file: string, p: LuaPos): Promise<string | undefined> {
  return lspHover(requireLuaContext().lsp, file, pos(p))
}

export function diagnostics(file: string): Promise<unknown[]> {
  const lsp = requireLuaContext().lsp
  const uri = `file://${path.resolve(file)}`
  return lsp.ensure(file).then(() => lsp.getDiagnostics(uri))
}

export function completion_(file: string, p: LuaPos): Promise<string[]> {
  return completion(requireLuaContext().lsp, file, pos(p))
}

export const luaLsp = {
  get_symbols: getSymbols,
  definition: definition_,
  references,
  hover,
  diagnostics,
  completion: completion_,
}
