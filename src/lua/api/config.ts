import { getByPath, setByPath } from "../../config/loader"
import { readOverrides, writeOverrides } from "../../config/overrides"
import { getLuaContext, requireLuaContext } from "./context"

let chain: Promise<void> = Promise.resolve()

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
  chain = chain.then(async () => {
    try {
      const overrides = await readOverrides()
      setByPath(overrides, key, value)
      await writeOverrides(overrides)
    } catch (err) {
      requireLuaContext()
      console.error("[x.config.set] 写入 overrides 失败:", err)
    }
  })
}

export const luaConfig = { get, get_all: getAll, set }
