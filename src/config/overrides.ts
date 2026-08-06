import fs from "node:fs"
import path from "node:path"
import { getLuaEngine } from "../lua/engine"
import { setByPath } from "./loader"
import { ensureConfigDir, overridesFilePath } from "./paths"

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

function quoteString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r")
  return `"${escaped}"`
}

function keyOf(key: string): string {
  return IDENT.test(key) ? key : `[${quoteString(key)}]`
}

export function serializeLua(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth)
  const childPad = "  ".repeat(depth + 1)
  if (value === null || value === undefined) return "nil"
  if (typeof value === "string") return quoteString(value)
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return "{}"
    const items = value.map((item) => childPad + serializeLua(item, depth + 1))
    return `{\n${items.join(",\n")},\n${pad}}`
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return "{}"
    const lines = entries.map(([k, v]) => `${childPad}${keyOf(k)} = ${serializeLua(v, depth + 1)}`)
    return `{\n${lines.join(",\n")},\n${pad}}`
  }
  return "nil"
}

export async function readOverrides(): Promise<Record<string, unknown>> {
  const file = overridesFilePath()
  if (!fs.existsSync(file)) return {}
  try {
    const lua = await getLuaEngine()
    const result = await lua.doString(fs.readFileSync(file, "utf8"))
    if (typeof result === "object" && result !== null && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }
  } catch {
    // 损坏的 overrides 忽略
  }
  return {}
}

export async function writeOverrides(overrides: Record<string, unknown>): Promise<void> {
  ensureConfigDir()
  const file = overridesFilePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const content = `-- 自动生成 by xuanjian config set / x.config.set. 请勿手改。\nreturn ${serializeLua(overrides)}\n`
  fs.writeFileSync(file, content)
}

// 所有 overrides 写入统一串行化（读-改-写整个文件，并发会丢更新）
let chain: Promise<void> = Promise.resolve()

export async function setOverride(key: string, value: unknown): Promise<void> {
  const task = chain.then(async () => {
    const overrides = await readOverrides()
    setByPath(overrides, key, value)
    await writeOverrides(overrides)
  })
  chain = task.catch(() => {})
  await task
}

/** 等待所有待写入的 overrides 落盘（退出前调用） */
export function flushOverrides(): Promise<void> {
  return chain
}
