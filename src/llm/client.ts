import type { Config, ProviderEntry } from "../config/schema"
import type { AdapterType, CompleteParams, LLMEvent } from "./llm"
import { parseModelId } from "./llm"
import { getAdapter } from "./protocol"
import { findBuiltin } from "./providers"

export interface ResolvedProvider {
  providerID: string
  modelID: string
  type: AdapterType
  baseUrl?: string
  apiKey?: string
  extra: Record<string, string> | undefined
}

const FALLBACK_ENV: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  azure: "AZURE_API_KEY",
  aws: "AWS_ACCESS_KEY_ID",
  "github-copilot": "GITHUB_COPILOT_TOKEN",
  cloudflare: "CLOUDFLARE_API_TOKEN",
}

function entryConfig(entry: ProviderEntry): ResolvedProvider {
  const type = entry.type ?? "openai-compatible"
  const apiKey = entry.api_key_env ? process.env[entry.api_key_env] : undefined
  return { providerID: "", modelID: "", type, baseUrl: entry.base_url, apiKey, extra: entry.extra }
}

export function resolveProvider(providerID: string, modelID: string, config: Config): ResolvedProvider {
  const user = config.provider[providerID]
  if (user) {
    const resolved = entryConfig(user)
    resolved.providerID = providerID
    resolved.modelID = modelID
    return resolved
  }
  const builtin = findBuiltin(providerID)
  if (!builtin) throw new Error(`未知 provider "${providerID}"（可用 xuanjian providers list 查看，或在配置中声明）`)
  const env = builtin.api_key_env ?? FALLBACK_ENV[providerID]
  const apiKey = env ? process.env[env] : undefined
  return { providerID, modelID, type: builtin.type, baseUrl: builtin.base_url, apiKey, extra: undefined }
}

export async function* complete(model: string, params: Omit<CompleteParams, "model">, config: Config): AsyncGenerator<LLMEvent> {
  const { providerID, modelID } = parseModelId(model)
  const resolved = resolveProvider(providerID, modelID, config)
  const adapter = getAdapter(resolved.type)
  yield* adapter.complete({ ...params, model: modelID, baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, extra: resolved.extra })
}
