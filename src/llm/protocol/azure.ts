import type { Adapter, CompleteParams, LLMEvent } from "../llm"
import { parseSSE } from "./sse"
import { toOpenAIMessages } from "./openai-chat"

export class AzureAdapter implements Adapter {
  readonly type = "azure" as const

  async *complete(params: CompleteParams): AsyncIterable<LLMEvent> {
    const resource = params.extra?.resource ?? process.env.AZURE_RESOURCE_NAME
    const apiVersion = params.extra?.api_version ?? process.env.AZURE_API_VERSION ?? "2024-10-21"
    const apiKey = params.apiKey ?? process.env.AZURE_API_KEY
    if (!resource || !apiKey) {
      yield { type: "error", message: "缺少 AZURE_RESOURCE_NAME / AZURE_API_KEY" }
      return
    }

    const endpoint = params.baseUrl ?? `https://${resource}.openai.azure.com`
    const deployment = params.model
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`

    const body: Record<string, unknown> = {
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

    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "api-key": apiKey },
        body: JSON.stringify(body),
        signal: params.signal,
      })
    } catch (err) {
      yield { type: "error", message: `请求失败: ${err instanceof Error ? err.message : String(err)}` }
      return
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      yield { type: "error", message: `Azure API ${response.status}: ${text.slice(0, 500)}` }
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
      if (typeof delta.content === "string" && delta.content.length > 0) yield { type: "text", text: delta.content }
      const toolCalls = delta.tool_calls as { id?: string; function?: { name?: string; arguments?: string } }[] | undefined
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
