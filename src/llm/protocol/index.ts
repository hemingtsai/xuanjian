import type { Adapter, AdapterType } from "../llm"
import { AnthropicAdapter } from "./anthropic-messages"
import { AzureAdapter } from "./azure"
import { BedrockAdapter } from "./bedrock-converse"
import { CopilotAdapter } from "./copilot"
import { GeminiAdapter } from "./gemini"
import { OpenAICompatibleAdapter } from "./openai-chat"
import { OpenAIResponsesAdapter } from "./openai-responses"

const adapters = new Map<AdapterType, Adapter>()

export function registerAdapter(adapter: Adapter): void {
  adapters.set(adapter.type, adapter)
}

export function getAdapter(type: AdapterType): Adapter {
  const adapter = adapters.get(type)
  if (!adapter) {
    throw new Error(`适配器 ${type} 尚未实现`)
  }
  return adapter
}

registerAdapter(new AnthropicAdapter("anthropic"))
registerAdapter(new AnthropicAdapter("anthropic-compatible"))
registerAdapter(new OpenAICompatibleAdapter())
registerAdapter(new OpenAIResponsesAdapter())
registerAdapter(new GeminiAdapter())
registerAdapter(new AzureAdapter())
registerAdapter(new CopilotAdapter())
registerAdapter(new BedrockAdapter())
