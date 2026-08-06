import type { ToolDef } from "../../tools/registry"
import type { JSONSchema7 } from "../../llm/schema-json"
import { liveContext, getLuaContext, bufferTool, requireLuaContext } from "./context"

export interface LuaToolDef {
  name: string
  description?: string
  parameters?: JSONSchema7
  call: (args: Record<string, unknown>) => unknown
  permission?: { mode?: string }
  hidden?: boolean
}

export function register(def: LuaToolDef): void {
  if (!def || typeof def.name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(def.name)) {
    throw new Error(`x.tool.register 需要合法 name（^[a-z_][a-z0-9_]*$）`)
  }
  if (typeof def.call !== "function") throw new Error(`x.tool.register("${def.name}") 缺少 call 函数`)
  const tool: ToolDef = {
    id: def.name,
    description: def.description ?? "",
    parameters: def.parameters ?? { type: "object", properties: {} },
    async call(ctx, args) {
      const result = await def.call(args)
      if (typeof result === "string") return { title: def.name, output: result }
      if (result && typeof result === "object") {
        const r = result as { output?: string; title?: string; metadata?: Record<string, unknown> }
        return { title: r.title ?? def.name, output: r.output ?? "", metadata: r.metadata }
      }
      return { title: def.name, output: String(result ?? "") }
    },
  }
  const ctx = liveContext()
  if (ctx) {
    ctx.registry.registerOrReplace(tool)
  } else {
    bufferTool(tool)
  }
}

export function unregister(name: string): void {
  const ctx = getLuaContext()
  if (ctx) ctx.registry.unregister(name)
}

export function callTool(name: string, args: Record<string, unknown>): Promise<{ output: string; title: string }> {
  const ctx = requireLuaContext()
  const tool = ctx.registry.get(name)
  if (!tool) throw new Error(`工具不存在: ${name}`)
  return tool.call({ cwd: ctx.cwd }, args).then((r) => ({ output: r.output, title: r.title }))
}

export const luaTool = { register, unregister, call: callTool }
