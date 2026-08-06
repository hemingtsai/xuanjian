import type { AdapterType } from "./llm"

export interface CatalogProvider {
  id: string
  type: AdapterType
  base_url?: string
  default_models: Record<string, { name?: string; context?: number }>
  default_model?: string
  api_key_env?: string
}

export const BUILTIN_PROVIDERS: CatalogProvider[] = [
  {
    id: "anthropic",
    type: "anthropic",
    base_url: "https://api.anthropic.com/v1",
    api_key_env: "ANTHROPIC_API_KEY",
    default_model: "claude-sonnet-4-5",
    default_models: {
      "claude-sonnet-4-5": { name: "Claude Sonnet 4.5", context: 200000 },
      "claude-opus-4-5": { name: "Claude Opus 4.5", context: 200000 },
      "claude-haiku-4-5": { name: "Claude Haiku 4.5", context: 200000 },
    },
  },
  {
    id: "openai",
    type: "openai-responses",
    base_url: "https://api.openai.com/v1",
    api_key_env: "OPENAI_API_KEY",
    default_model: "gpt-5.2",
    default_models: {
      "gpt-5.2": { name: "GPT-5.2", context: 400000 },
      "gpt-5-mini": { name: "GPT-5 mini", context: 400000 },
      "gpt-4.1": { name: "GPT-4.1", context: 1000000 },
    },
  },
  {
    id: "google",
    type: "gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta",
    api_key_env: "GEMINI_API_KEY",
    default_model: "gemini-2.5-flash",
    default_models: {
      "gemini-2.5-flash": { name: "Gemini 2.5 Flash", context: 1000000 },
      "gemini-2.5-pro": { name: "Gemini 2.5 Pro", context: 1000000 },
    },
  },
  {
    id: "xai",
    type: "openai-responses",
    base_url: "https://api.x.ai/v1",
    api_key_env: "XAI_API_KEY",
    default_model: "grok-4",
    default_models: {
      "grok-4": { name: "Grok 4", context: 256000 },
      "grok-4-fast": { name: "Grok 4 Fast", context: 256000 },
    },
  },
  {
    id: "openrouter",
    type: "openai",
    base_url: "https://openrouter.ai/api/v1",
    api_key_env: "OPENROUTER_API_KEY",
    default_models: {},
  },
  {
    id: "azure",
    type: "azure",
    api_key_env: "AZURE_API_KEY",
    default_models: {},
  },
  {
    id: "aws",
    type: "bedrock",
    api_key_env: "AWS_ACCESS_KEY_ID",
    default_models: {},
  },
  {
    id: "github-copilot",
    type: "copilot",
    api_key_env: "GITHUB_COPILOT_TOKEN",
    default_models: {},
  },
  {
    id: "cloudflare",
    type: "openai-compatible",
    api_key_env: "CLOUDFLARE_API_TOKEN",
    default_models: {},
  },
]

export function findBuiltin(id: string): CatalogProvider | undefined {
  return BUILTIN_PROVIDERS.find((p) => p.id === id)
}
