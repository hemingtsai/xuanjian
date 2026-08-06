import type { Config } from "../config/schema"
import { BUILTIN_PROVIDERS } from "./providers"

export function listProviders(config: Config): { id: string; type: string; custom: boolean; models: number }[] {
  const out = BUILTIN_PROVIDERS.map((p) => ({
    id: p.id,
    type: p.type,
    custom: false,
    models: Object.keys(p.default_models).length,
  }))
  for (const [id, entry] of Object.entries(config.provider)) {
    const existing = out.find((p) => p.id === id)
    const models = entry.models ? Object.keys(entry.models).length : 0
    if (existing) {
      existing.custom = true
      if (models > 0) existing.models = models
    } else {
      out.push({ id, type: entry.type ?? "openai-compatible", custom: true, models })
    }
  }
  return out.sort((a, b) => (a.custom === b.custom ? a.id.localeCompare(b.id) : a.custom ? 1 : -1))
}

export function listModels(providerID: string, config: Config): { id: string; name?: string; context?: number }[] {
  const builtin = BUILTIN_PROVIDERS.find((p) => p.id === providerID)
  const user = config.provider[providerID]
  const models = new Map<string, { name?: string; context?: number }>()
  if (builtin) {
    for (const [id, info] of Object.entries(builtin.default_models)) models.set(id, info)
  }
  if (user?.models) {
    for (const [id, info] of Object.entries(user.models)) models.set(id, info)
  }
  return Array.from(models.entries()).map(([id, info]) => ({ id, name: info.name, context: info.context }))
}
