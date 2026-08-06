export type EventName =
  | "session.start"
  | "session.end"
  | "message.user"
  | "message.assistant"
  | "tool.before_call"
  | "tool.after_call"
  | "permission.request"
  | "agent.selected"
  | "config.loaded"
  | "lsp.diagnostic"
  | "review.completed"
  | "goal.started"
  | "goal.task.done"
  | "goal.milestone.review"
  | "goal.blocked"
  | "goal.done"

export type EventPayload = Record<string, unknown>

export type EventHandler = (payload: EventPayload) => void | Promise<void>

const handlers = new Map<EventName, Set<EventHandler>>()

export function on(event: EventName, handler: EventHandler): () => void {
  const set = handlers.get(event) ?? new Set<EventHandler>()
  set.add(handler)
  handlers.set(event, set)
  return () => set.delete(handler)
}

export function off(event: EventName, handler: EventHandler): void {
  handlers.get(event)?.delete(handler)
}

export async function emit(event: EventName, payload: EventPayload): Promise<void> {
  const set = handlers.get(event)
  if (!set) return
  const snapshot = [...set]
  for (const handler of snapshot) {
    try {
      await handler(payload)
    } catch (err) {
      console.error(`[event:${event}] handler error:`, err)
    }
  }
}

export function clear(): void {
  handlers.clear()
}
