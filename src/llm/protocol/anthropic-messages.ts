import type { Adapter, AdapterType, CompleteParams, LLMEvent, LLMMessage, TextMessage, ToolCall } from "../llm"
import { parseSSE } from "./sse"

const API_VERSION = "2023-06-01"
const DEFAULT_MAX_TOKENS = 8192

function toAnthropicMessages(messages: LLMMessage[]): unknown[] {
  const out: unknown[] = []
  let pendingToolResults: { id: string; content: string }[] = []

  const flushToolResults = () => {
    if (pendingToolResults.length === 0) return
    out.push({
      role: "user",
      content: pendingToolResults.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })),
    })
    pendingToolResults = []
  }

  for (const message of messages) {
    if (message.role === "tool") {
      pendingToolResults.push({ id: message.toolCallId, content: message.content })
      continue
    }
    flushToolResults()
    if (message.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: message.content }] })
      continue
    }
    const blocks: unknown[] = []
    if (message.content) blocks.push({ type: "text", text: message.content })
    for (const tc of message.toolCalls ?? []) {
      blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args })
    }
    out.push({ role: "assistant", content: blocks })
  }
  flushToolResults()
  return out
}

export class AnthropicAdapter implements Adapter {
  readonly type: AdapterType

  constructor(type: AdapterType = "anthropic") {
    this.type = type
  }

  async *complete(params: CompleteParams): AsyncIterable<LLMEvent> {
    const baseUrl = params.baseUrl ?? "https://api.anthropic.com/v1"
    const apiKey = params.apiKey ?? process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      yield { type: "error", message: "缺少 ANTHROPIC_API_KEY（或配置 provider.anthropic.api_key_env）" }
      return
    }

    const body: Record<string, unknown> = {
      model: params.model,
      system: params.system,
      messages: toAnthropicMessages(params.messages),
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
    }
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters ?? { type: "object", properties: {} },
      }))
    }
    if (params.temperature !== undefined) body.temperature = params.temperature

    let response: Response
    try {
      response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          ...params.extra,
        },
        body: JSON.stringify(body),
        signal: params.signal,
      })
    } catch (err) {
      yield { type: "error", message: `请求失败: ${err instanceof Error ? err.message : String(err)}` }
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      yield { type: "error", message: `Anthropic API ${response.status}: ${text.slice(0, 500)}` }
      return
    }

    const activeTool = { id: "", name: "", args: "" }
    for await (const sse of parseSSE(response.body, params.signal)) {
      if (!sse.data) continue
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(sse.data)
      } catch {
        continue
      }
      switch (payload.type) {
        case "content_block_start": {
          const block = payload.content_block as Record<string, unknown> | undefined
          if (block?.type === "tool_use") {
            activeTool.id = String(block.id ?? "")
            activeTool.name = String(block.name ?? "")
            activeTool.args = ""
          }
          break
        }
        case "content_block_delta": {
          const delta = payload.delta as Record<string, unknown> | undefined
          if (delta?.type === "text_delta") {
            yield { type: "text", text: String(delta.text ?? "") }
          } else if (delta?.type === "input_json_delta") {
            activeTool.args += String(delta.partial_json ?? "")
          } else if (delta?.type === "thinking_delta") {
            yield { type: "reasoning", text: String(delta.thinking ?? "") }
          }
          break
        }
        case "content_block_stop": {
          if (activeTool.id && activeTool.name) {
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(activeTool.args || "{}")
            } catch {
              args = {}
            }
            yield { type: "tool_call", id: activeTool.id, name: activeTool.name, args }
            activeTool.id = ""
            activeTool.name = ""
            activeTool.args = ""
          }
          break
        }
        case "message_delta": {
          // 预留：usage / stop_reason
          break
        }
        case "message_stop": {
          yield { type: "done" }
          return
        }
        case "error": {
          const err = payload.error as Record<string, unknown> | undefined
          yield { type: "error", message: `Anthropic error: ${err?.message ?? "unknown"}` }
          return
        }
      }
    }
    yield { type: "done" }
  }
}

export function textMessage(role: "user" | "assistant", content: string, toolCalls?: ToolCall[]): TextMessage {
  return { role, content, toolCalls }
}
