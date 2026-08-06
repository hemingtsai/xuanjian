import type { AgentConfig } from "../../config/schema"
import { liveContext, getLuaContext, bufferAgent } from "./context"

export interface LuaAgentDef {
  id: string
  name?: string
  description?: string
  model?: string
  system_prompt?: string
  tools?: string[]
  subagent?: boolean
}

export function register(def: LuaAgentDef): void {
  if (!def || typeof def.id !== "string" || def.id.length === 0) throw new Error("x.agent.register 需要 id")
  const entry: AgentConfig = {
    name: def.name,
    description: def.description,
    model: def.model,
    system_prompt: def.system_prompt,
    tools: def.tools,
    subagent: def.subagent,
  }
  const ctx = liveContext()
  if (ctx) {
    ctx.config.agents[def.id] = entry
  } else {
    bufferAgent(def.id, entry)
  }
}

export function unregister(id: string): void {
  const ctx = getLuaContext()
  if (ctx) delete ctx.config.agents[id]
}

export function get(id: string): AgentConfig | undefined {
  const ctx = getLuaContext()
  if (!ctx) return undefined
  return ctx.config.agents[id]
}

export const luaAgent = { register, unregister, get }
