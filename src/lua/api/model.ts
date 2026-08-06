import type { ModelInfo } from "../../config/schema"
import { liveContext, getLuaContext, bufferModel } from "./context"

export interface LuaModelInfo {
  name?: string
  context?: number
}

export function register(providerID: string, modelID: string, info: LuaModelInfo): void {
  const entry: ModelInfo = { name: info.name, context: info.context }
  const ctx = liveContext()
  if (ctx) {
    const provider = ctx.config.provider[providerID]
    if (provider) {
      provider.models = { ...(provider.models ?? {}), [modelID]: entry }
    } else {
      ctx.config.provider[providerID] = { type: "openai-compatible", models: { [modelID]: entry } }
    }
  } else {
    bufferModel(providerID, modelID, entry)
  }
}

export function unregister(providerID: string, modelID: string): void {
  const ctx = getLuaContext()
  if (ctx) {
    const entry = ctx.config.provider[providerID]
    if (entry?.models) delete entry.models[modelID]
  }
}

export const luaModel = { register, unregister }
