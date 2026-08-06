import { getByPath, setByPath } from "../../config/loader"
import { setOverride } from "../../config/overrides"
import { getLuaContext, requireLuaContext } from "./context"

export function get(key: string): unknown {
  const ctx = getLuaContext()
  if (!ctx) return undefined
  return getByPath(ctx.config, key)
}

export function getAll(): Record<string, unknown> {
  const ctx = getLuaContext()
  if (!ctx) return {}
  return ctx.config as unknown as Record<string, unknown>
}

export function set(key: string, value: unknown): void {
  const ctx = getLuaContext()
  if (ctx) {
    setByPath(ctx.config as unknown as Record<string, unknown>, key, value)
  }
  // 与 CLI/TUI 的 setOverride 共用同一串行 chain，避免并发丢更新
  setOverride(key, value).catch((err) => {
    requireLuaContext()
    console.error("[x.config.set] 写入 overrides 失败:", err)
  })
}

export const luaConfig = { get, get_all: getAll, set }
