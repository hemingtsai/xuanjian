import type { Config, ProviderEntry } from "../config/schema"
import type { AdapterType, CompleteParams, LLMEvent } from "./llm"
import { parseModelId } from "./llm"
import { getAdapter } from "./protocol"
import { findBuiltin } from "./providers"
import { getCredential } from "../config/credentials"

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

function apiKeyFromEnv(envName: string | undefined, providerID: string): string | undefined {
  if (envName && process.env[envName]) return process.env[envName]
  const cred = getCredential(providerID)
  return cred?.apiKey
}

function entryConfig(entry: ProviderEntry, providerID: string): ResolvedProvider {
  const type = entry.type ?? "openai-compatible"
  const apiKey = apiKeyFromEnv(entry.api_key_env, providerID)
  const baseUrl = entry.base_url ?? getCredential(providerID)?.baseUrl
  return { providerID, modelID: "", type, baseUrl, apiKey, extra: entry.extra }
}

export function resolveProvider(providerID: string, modelID: string, config: Config): ResolvedProvider {
  const user = config.provider[providerID]
  if (user) {
    const resolved = entryConfig(user, providerID)
    resolved.modelID = modelID
    return resolved
  }
  const builtin = findBuiltin(providerID)
  if (!builtin) throw new Error(`未知 provider "${providerID}"（可用 xuanjian providers list 查看，或在配置中声明）`)
  const env = builtin.api_key_env ?? FALLBACK_ENV[providerID]
  const apiKey = apiKeyFromEnv(env, providerID)
  const baseUrl = builtin.base_url ?? getCredential(providerID)?.baseUrl
  return { providerID, modelID, type: builtin.type, baseUrl, apiKey, extra: undefined }
}

export async function* complete(model: string, params: Omit<CompleteParams, "model">, config: Config): AsyncGenerator<LLMEvent> {
  const { providerID, modelID } = parseModelId(model)
  const resolved = resolveProvider(providerID, modelID, config)
  const adapter = getAdapter(resolved.type)
  yield* adapter.complete({ ...params, model: modelID, baseUrl: resolved.baseUrl, apiKey: resolved.apiKey, extra: resolved.extra })
}

export async function generateText(model: string, input: { system: string; prompt: string; signal?: AbortSignal }, config: Config): Promise<string> {
  const parts: string[] = []
  for await (const event of complete(model, { system: input.system, messages: [{ role: "user", content: input.prompt }], signal: input.signal }, config)) {
    if (event.type === "text") parts.push(event.text)
    else if (event.type === "error") throw new Error(event.message)
  }
  return parts.join("")
}
