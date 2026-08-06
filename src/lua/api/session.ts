import { requireLuaContext } from "./context"

export function current(): Record<string, unknown> | undefined {
  const ctx = requireLuaContext()
  const session = ctx.sessions.resumeLatest()
  if (!session) return undefined
  return { id: session.id, cwd: session.cwd, model: session.model, agent: session.agent, title: session.title }
}

export function messages(): Record<string, unknown>[] {
  const ctx = requireLuaContext()
  const session = ctx.sessions.resumeLatest()
  if (!session) return []
  return session.messages().map((m) => ({
    role: m.role,
    content: m.content,
    tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
    tool_call_id: m.tool_call_id,
  }))
}

export function send(text: string): void {
  const ctx = requireLuaContext()
  const session = ctx.sessions.resumeLatest()
  if (session) session.addMessage({ role: "user", content: text })
}

export const luaSession = { current, messages, send }
