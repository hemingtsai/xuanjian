export type AdapterType =
  | "anthropic"
  | "anthropic-compatible"
  | "openai"
  | "openai-responses"
  | "gemini"
  | "openai-compatible"
  | "azure"
  | "bedrock"
  | "copilot"

export interface ModelInfo {
  name?: string
  context?: number
}

export interface ProviderEntry {
  type?: AdapterType
  base_url?: string
  api_key_env?: string
  default_model?: string
  models?: Record<string, ModelInfo>
  extra?: Record<string, string>
}

export interface LspServerEntry {
  command?: string
  args?: string[]
  initializationOptions?: Record<string, unknown>
  disabled?: boolean
}

export interface ReviewerConfig {
  name: string
  model: string
  description: string
  prompt?: string
  triggers: string[]
}

export interface AgentConfig {
  name?: string
  description?: string
  model?: string
  system_prompt?: string
  tools?: string[]
  subagent?: boolean
}

export interface PermissionConfig {
  default?: "ask" | "allow" | "deny"
  allow?: string[]
  deny?: string[]
}

export interface ReviewConfig {
  enabled?: boolean
  scheduler?: { model?: string; prompt?: string }
  reviewers?: ReviewerConfig[]
  auto_commit?: boolean
  auto_push?: boolean
}

export interface GoalConfig {
  verification?: string[]
  max_attempts?: number
  max_steps?: number
  max_tokens?: number
  checkpoint?: "write"
  auto_review?: boolean
  plan_model?: string
}

export type PluginRef = string | { path: string }

export interface Config {
  model?: string
  default_agent?: string
  workspace?: string
  theme: "dark" | "light"
  provider: Record<string, ProviderEntry>
  lsp: Record<string, LspServerEntry>
  permission: PermissionConfig
  agents: Record<string, AgentConfig>
  review: ReviewConfig
  goal: GoalConfig
  plugins: PluginRef[]
}
