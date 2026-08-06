import type { ProviderEntry } from "../../config/schema"
import { getLuaContext, bufferProvider } from "./context"

export interface LuaProviderDef {
  id: string
  type?: string
  base_url?: string
  api_key_env?: string
  default_model?: string
  models?: Record<string, { name?: string; context?: number }>
}

export function register(def: LuaProviderDef): void {
  if (!def || typeof def.id !== "string" || def.id.length === 0) throw new Error("x.provider.register 需要 id")
  const entry: ProviderEntry = {
    type: (def.type as ProviderEntry["type"]) ?? "openai-compatible",
    base_url: def.base_url,
    api_key_env: def.api_key_env,
    default_model: def.default_model,
    models: def.models,
  }
  const ctx = getLuaContext()
  if (ctx) {
    ctx.config.provider[def.id] = entry
  } else {
    bufferProvider(def.id, entry)
  }
}

export const luaProvider = { register }
