import fs from "node:fs"
import { getLuaEngine } from "../lua/engine"
import { DEFAULTS } from "./defaults"
import { configFilePath, overridesFilePath } from "./paths"
import type { Config } from "./schema"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function mergeConfig(base: Config, overlay: Record<string, unknown>): Config {
  const out: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) }
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue
    const current = out[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      out[key] = mergeConfig(current as unknown as Config, value)
    } else {
      out[key] = value
    }
  }
  return out as unknown as Config
}

async function loadLuaTable(file: string): Promise<Record<string, unknown> | undefined> {
  if (!fs.existsSync(file)) return undefined
  const lua = await getLuaEngine()
  const source = fs.readFileSync(file, "utf8")
  const result = await lua.doString(source)
  if (isPlainObject(result)) return result
  return undefined
}

export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  let current: unknown = obj
  for (const key of path.split(".")) {
    if (isPlainObject(current)) {
      current = current[key]
    } else {
      return undefined
    }
  }
  return current
}

export function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".")
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!
    const next = current[key]
    if (!isPlainObject(next)) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]!] = value
}

export async function loadConfig(): Promise<Config> {
  const user = (await loadLuaTable(configFilePath())) ?? {}
  const overrides = (await loadLuaTable(overridesFilePath())) ?? {}
  return mergeConfig(mergeConfig(DEFAULTS, user), overrides)
}
