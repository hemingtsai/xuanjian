import type { Adapter, CompleteParams, LLMEvent } from "../llm"
import { parseSSE } from "./sse"
import { toResponsesInput } from "./openai-responses"

async function resolveCopilotToken(): Promise<string | undefined> {
  const env = process.env.GITHUB_COPILOT_TOKEN
  if (env) return env
  const token = process.env.GITHUB_TOKEN
  if (token) return token
  try {
    const proc = Bun.spawn(["gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" })
    const out = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code === 0) {
      const t = out.trim()
      if (t) return t
    }
  } catch {
    // gh 不可用
  }
  return undefined
}

export class CopilotAdapter implements Adapter {
  readonly type = "copilot" as const

  async *complete(params: CompleteParams): AsyncIterable<LLMEvent> {
    const baseUrl = params.baseUrl ?? "https://api.githubcopilot.com"
    const apiKey = params.apiKey ?? (await resolveCopilotToken())
    if (!apiKey) {
      yield { type: "error", message: "缺少 Copilot 令牌（GITHUB_COPILOT_TOKEN / GITHUB_TOKEN / gh auth token）" }
      return
    }

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

    let response: Response
    try {
      response = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
          "editor-version": "xuanjian/0.1.0",
          "editor-plugin-version": "xuanjian/0.1.0",
          "copilot-integration-id": "vscode-chat",
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
      yield { type: "error", message: `Copilot API ${response.status}: ${text.slice(0, 500)}` }
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
          if (cur) cur.args = String(payload.arguments ?? "")
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
        case "error":
          yield { type: "error", message: `Copilot error: ${String(payload.message ?? "unknown")}` }
          return
      }
    }
    if (!done) yield { type: "done" }
  }
}
