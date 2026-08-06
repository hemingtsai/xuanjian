import type { Adapter, CompleteParams, LLMEvent, LLMMessage } from "../llm"
import { parseSSE } from "./sse"

export function toResponsesInput(messages: LLMMessage[]): unknown[] {
  const out: unknown[] = []
  for (const message of messages) {
    if (message.role === "tool") {
      out.push({ type: "function_call_output", call_id: message.toolCallId, output: message.content })
      continue
    }
    if (message.role === "user") {
      out.push({ role: "user", content: [{ type: "input_text", text: message.content }] })
      continue
    }
    const content: unknown[] = []
    if (message.content) content.push({ type: "output_text", text: message.content })
    for (const tc of message.toolCalls ?? []) {
      content.push({ type: "function_call", call_id: tc.id, name: tc.name, arguments: JSON.stringify(tc.args) })
    }
    out.push({ role: "assistant", content })
  }
  return out
}

export class OpenAIResponsesAdapter implements Adapter {
  readonly type = "openai-responses" as const

  async *complete(params: CompleteParams): AsyncIterable<LLMEvent> {
    const baseUrl = params.baseUrl ?? "https://api.openai.com/v1"
    const apiKey = params.apiKey ?? process.env.OPENAI_API_KEY

    const body: Record<string, unknown> = {
      model: params.model,
      input: toResponsesInput(params.messages),
      stream: true,
    }
    if (params.system) body.instructions = params.system
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        type: "function",
        name: t.name,
        description: t.description,
        parameters: t.parameters ?? { type: "object", properties: {} },
      }))
    }
    if (params.temperature !== undefined) body.temperature = params.temperature

    const headers: Record<string, string> = { "content-type": "application/json", ...params.extra }
    if (apiKey) headers["authorization"] = `Bearer ${apiKey}`

    let response: Response
    try {
      response = await fetch(`${baseUrl}/responses`, {
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
      yield { type: "error", message: `OpenAI Responses ${response.status}: ${text.slice(0, 500)}` }
      return
    }

    const toolAcc = new Map<string, { name: string; args: string }>()
    let done = false
    for await (const sse of parseSSE(response.body, params.signal)) {
      if (sse.data === undefined) continue
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(sse.data)
      } catch {
        continue
      }
      switch (sse.event) {
        case "response.output_text.delta":
          yield { type: "text", text: String(payload.delta ?? "") }
          break
        case "response.output_text.done": {
          const item = payload.item as Record<string, unknown> | undefined
          if (item) {
            const content = (item.content as Record<string, unknown>[]) ?? []
            for (const c of content) {
              if (c.type === "output_text" && c.text) yield { type: "text", text: String(c.text) }
            }
          }
          break
        }
        case "response.function_call_arguments.delta": {
          const id = String(payload.item_id ?? "")
          const name = String(payload.name ?? "")
          const cur = toolAcc.get(id) ?? { name, args: "" }
          cur.args += String(payload.delta ?? "")
          toolAcc.set(id, cur)
          break
        }
        case "response.function_call_arguments.done": {
          const id = String(payload.item_id ?? "")
          const cur = toolAcc.get(id)
          if (cur) {
            cur.args = String(payload.arguments ?? "")
            toolAcc.set(id, cur)
          }
          break
        }
        case "response.completed":
          for (const [id, cur] of toolAcc) {
            if (!cur.name) continue
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(cur.args || "{}")
            } catch {
              args = {}
            }
            yield { type: "tool_call", id, name: cur.name, args }
          }
          yield { type: "done" }
          done = true
          return
        case "error": {
          const err = payload as { message?: string }
          yield { type: "error", message: `OpenAI Responses error: ${err.message ?? "unknown"}` }
          return
        }
      }
    }
    if (!done) yield { type: "done" }
  }
}
