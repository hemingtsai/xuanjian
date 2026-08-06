import { getLuaContext } from "./context"

const pending = new Map<string, unknown>()

export function get(key: string): unknown {
  if (getLuaContext()) {
    const raw = getLuaContext()!.store.getState(`state:${key}`)
    if (raw === undefined) return pending.get(key)
    try {
      return JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  return pending.get(key)
}

export function set(key: string, value: unknown): void {
  pending.set(key, value)
  const ctx = getLuaContext()
  if (ctx) {
    try {
      ctx.store.setState(`state:${key}`, JSON.stringify(value))
    } catch {
      // 非 JSON 可序列化则忽略持久化
    }
  }
}

export function deleteKey(key: string): void {
  pending.delete(key)
  const ctx = getLuaContext()
  if (ctx) ctx.store.deleteState(`state:${key}`)
}

export const luaState = { get, set, delete: deleteKey }
