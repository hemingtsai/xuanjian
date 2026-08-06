import type { JSONSchema7 } from "./schema-json"

export type AdapterType =
  | "anthropic"
  | "openai"
  | "openai-responses"
  | "gemini"
  | "openai-compatible"
  | "azure"
  | "bedrock"
  | "copilot"

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface TextMessage {
  role: "user" | "assistant"
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
}

export interface ToolMessage {
  role: "tool"
  content: string
  toolCallId: string
}

export type LLMMessage = TextMessage | ToolMessage

export interface ToolDef {
  name: string
  description: string
  parameters?: JSONSchema7
}

export interface CompleteParams {
  model: string
  system?: string
  messages: LLMMessage[]
  tools?: ToolDef[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
  baseUrl?: string
  apiKey?: string
  extra?: Record<string, string>
}

export type LLMEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" }

export interface Adapter {
  readonly type: AdapterType
  complete(params: CompleteParams): AsyncIterable<LLMEvent>
}

export function parseModelId(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf("/")
  if (slash === -1) throw new Error(`模型格式应为 "provider/model"，收到 "${model}"`)
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) }
}
