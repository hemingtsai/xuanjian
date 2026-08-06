import type { Adapter, CompleteParams, LLMEvent, LLMMessage } from "../llm"
import { parseSSE } from "./sse"

function toOpenAIMessages(messages: LLMMessage[]): unknown[] {
  const out: unknown[] = []
  for (const message of messages) {
    if (message.role === "tool") {
      out.push({ role: "tool", tool_call_id: message.toolCallId, content: message.content })
      continue
    }
    if (message.role === "user") {
      out.push({ role: "user", content: message.content })
      continue
    }
    const msg: Record<string, unknown> = { role: "assistant", content: message.content }
    if (message.toolCalls && message.toolCalls.length > 0) {
      msg.tool_calls = message.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }))
    }
    out.push(msg)
  }
  return out
}

export class OpenAICompatibleAdapter implements Adapter {
  readonly type = "openai-compatible" as const

  async *complete(params: CompleteParams): AsyncIterable<LLMEvent> {
    const baseUrl = params.baseUrl ?? "https://api.openai.com/v1"
    const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY

    const body: Record<string, unknown> = {
      model: params.model,
      messages: toOpenAIMessages(params.messages),
      stream: true,
    }
    if (params.system) body.messages = [{ role: "system", content: params.system }, ...(body.messages as unknown[])]
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters ?? { type: "object", properties: {} } },
      }))
    }
    if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens
    if (params.temperature !== undefined) body.temperature = params.temperature

    const headers: Record<string, string> = { "content-type": "application/json", ...params.extra }
    if (apiKey) headers["authorization"] = `Bearer ${apiKey}`

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: params.signal,
      })
    } catch (err) {
      yield { type: "error", message: `请求失败: ${err instanceof Error ? err.message : String(err)}` }
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      yield { type: "error", message: `OpenAI API ${response.status}: ${text.slice(0, 500)}` }
      return
    }

    const toolAcc = { id: "", name: "", args: "" }
    for await (const sse of parseSSE(response.body, params.signal)) {
      if (sse.data === undefined) continue
      if (sse.data === "[DONE]") {
        yield { type: "done" }
        return
      }
      let payload: { choices?: { delta?: Record<string, unknown>; finish_reason?: string | null }[] }
      try {
        payload = JSON.parse(sse.data)
      } catch {
        continue
      }
      const choice = payload.choices?.[0]
      const delta = choice?.delta ?? {}
      if (typeof delta.content === "string" && delta.content.length > 0) {
        yield { type: "text", text: delta.content }
      }
      if (delta.reasoning_content && typeof delta.reasoning_content === "string") {
        yield { type: "reasoning", text: delta.reasoning_content }
      }
      const toolCalls = delta.tool_calls as { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined
      if (toolCalls) {
        for (const tc of toolCalls) {
          if (tc.id) toolAcc.id = tc.id
          if (tc.function?.name) toolAcc.name = tc.function.name
          if (tc.function?.arguments) toolAcc.args += tc.function.arguments
        }
      }
      if (choice?.finish_reason === "tool_calls" && toolAcc.id && toolAcc.name) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(toolAcc.args || "{}")
        } catch {
          args = {}
        }
        yield { type: "tool_call", id: toolAcc.id, name: toolAcc.name, args }
        toolAcc.id = ""
        toolAcc.name = ""
        toolAcc.args = ""
      }
    }
    yield { type: "done" }
  }
}
