import type { Adapter, CompleteParams, LLMEvent, LLMMessage } from "../llm"
import { parseSSE } from "./sse"

function toGeminiContents(messages: LLMMessage[]): unknown[] {
  const out: unknown[] = []
  for (const message of messages) {
    if (message.role === "tool") {
      out.push({
        role: "user",
        parts: [{ functionResponse: { name: message.content.slice(0, 64), response: { result: message.content } } }],
      })
      continue
    }
    if (message.role === "user") {
      out.push({ role: "user", parts: [{ text: message.content }] })
      continue
    }
    const parts: unknown[] = []
    if (message.content) parts.push({ text: message.content })
    for (const tc of message.toolCalls ?? []) {
      parts.push({ functionCall: { name: tc.name, args: tc.args } })
    }
    out.push({ role: "model", parts })
  }
  return out
}

export class GeminiAdapter implements Adapter {
  readonly type = "gemini" as const

  async *complete(params: CompleteParams): AsyncIterable<LLMEvent> {
    const baseUrl = params.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"
    const apiKey = params.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
    if (!apiKey) {
      yield { type: "error", message: "缺少 GEMINI_API_KEY / GOOGLE_API_KEY" }
      return
    }

    const body: Record<string, unknown> = {
      contents: toGeminiContents(params.messages),
    }
    if (params.system) body.systemInstruction = { parts: [{ text: params.system }] }
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map((t) => ({
        functionDeclarations: [
          {
            name: t.name,
            description: t.description,
            parameters: t.parameters ?? { type: "object", properties: {} },
          },
        ],
      }))
    }
    if (params.temperature !== undefined) body.generationConfig = { temperature: params.temperature }

    const url = `${baseUrl}/models/${params.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
    let response: Response
    try {
      response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: params.signal })
    } catch (err) {
      yield { type: "error", message: `请求失败: ${err instanceof Error ? err.message : String(err)}` }
      return
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      yield { type: "error", message: `Gemini API ${response.status}: ${text.slice(0, 500)}` }
      return
    }

    const fnAcc = new Map<string, { name: string; args: string }>()
    for await (const sse of parseSSE(response.body, params.signal)) {
      if (!sse.data) continue
      let payload: { candidates?: { content?: { parts?: { text?: string; functionCall?: { id?: string; name?: string; args?: Record<string, unknown> } }[] }; finishReason?: string }[] }
      try {
        payload = JSON.parse(sse.data)
      } catch {
        continue
      }
      for (const candidate of payload.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.text) yield { type: "text", text: part.text }
          if (part.functionCall) {
            const fc = part.functionCall
            const id = fc.id ?? fc.name ?? "fn"
            const name = fc.name ?? ""
            const cur = fnAcc.get(id) ?? { name, args: "" }
            if (fc.args && typeof fc.args === "object") {
              cur.args += JSON.stringify(fc.args)
            }
            fnAcc.set(id, cur)
          }
        }
        if (candidate.finishReason === "STOP" || candidate.finishReason === "MAX_TOKENS") {
          for (const [id, cur] of fnAcc) {
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
          return
        }
      }
    }
    yield { type: "done" }
  }
}
