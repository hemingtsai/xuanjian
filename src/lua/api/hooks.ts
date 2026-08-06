import type { LuaEngine } from "wasmoon"
import * as Events from "../../core/events"
import type { EventName } from "../../core/events"

type LuaCallback = (payload: Record<string, unknown>) => unknown

const hooks = new Map<string, Set<LuaCallback>>()

export function on(event: string, callback: LuaCallback): void {
  const set = hooks.get(event) ?? new Set<LuaCallback>()
  set.add(callback)
  hooks.set(event, set)
}

export function off(event: string, callback: LuaCallback): void {
  hooks.get(event)?.delete(callback)
}

export async function invoke(event: EventName, payload: Record<string, unknown>): Promise<void> {
  const set = hooks.get(event)
  if (!set) return
  for (const cb of [...set]) {
    try {
      const result = cb(payload)
      if (result && typeof (result as { then?: unknown }).then === "function") {
        await (result as Promise<unknown>)
      }
    } catch (err) {
      console.error(`[x.hooks] 事件 ${event} 回调错误:`, err)
    }
  }
}

const ALL_EVENTS: EventName[] = [
  "session.start",
  "session.end",
  "message.user",
  "message.assistant",
  "tool.before_call",
  "tool.after_call",
  "permission.request",
  "agent.selected",
  "config.loaded",
  "lsp.diagnostic",
  "review.completed",
  "goal.started",
  "goal.task.done",
  "goal.milestone.review",
  "goal.blocked",
  "goal.done",
]

export function bridgeEvents(): void {
  for (const event of ALL_EVENTS) {
    Events.on(event, (payload) => invoke(event, payload))
  }
}

export function installHooksOnEngine(engine: LuaEngine): void {
  void engine
}
