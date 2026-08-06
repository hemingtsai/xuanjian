import type { Adapter, AdapterType } from "../llm"
import { AnthropicAdapter } from "./anthropic-messages"
import { OpenAICompatibleAdapter } from "./openai-chat"

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

registerAdapter(new AnthropicAdapter())
registerAdapter(new OpenAICompatibleAdapter())
