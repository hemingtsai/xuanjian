import type { LuaEngine } from "wasmoon"
import fs from "node:fs"
import path from "node:path"
import { luaLog } from "./log"
import { luaConfig } from "./config"
import * as hooks from "./hooks"
import { luaState } from "./state"
import { luaUi } from "./ui"
import { luaTool } from "./tool"
import { luaProvider } from "./provider"
import { luaAgent } from "./agent"
import { luaCommand } from "./command"
import { luaModel } from "./model"
import { luaFs } from "./fs"
import { luaSystem } from "./system"
import { luaSession } from "./session"
import { luaHttp } from "./http"
import { luaPrompt } from "./prompt"
import { luaLsp } from "./lsp"
import { luaReview } from "./review"
import { luaGoal } from "./goal"
import { sleep } from "./async"
import { setLuaContext } from "./context"

export { setLuaContext, getLuaContext, requireLuaContext, flushPending, applyBufferedToConfig, bufferTool, bufferCommand, bufferProvider, bufferAgent, bufferModel, bufferReviewer } from "./context"

let installed = false

// 关键：x 表在 Lua 侧构建。直接注入 JS 对象会导致表中的 Lua 函数在调用时
// 运行在不可 yield 的主线程上（wasmoon 限制），协程 await 会失败。
type ApiLeaf = Record<string, unknown> | ((...args: unknown[]) => unknown)

function buildLuaXTable(api: Record<string, ApiLeaf>): string {
  const lines: string[] = ["x = {}"]
  for (const [ns, value] of Object.entries(api)) {
    if (typeof value === "function") {
      lines.push(`x[${JSON.stringify(ns)}] = _xapi[${JSON.stringify(ns)}]`)
      continue
    }
    lines.push(`x[${JSON.stringify(ns)}] = {}`)
    for (const name of Object.keys(value)) {
      lines.push(`x[${JSON.stringify(ns)}][${JSON.stringify(name)}] = _xapi[${JSON.stringify(ns)}][${JSON.stringify(name)}]`)
    }
  }
  lines.push("xuanjian = x")
  lines.push("_xapi = nil")
  return lines.join("\n")
}

export async function installXApi(engine: LuaEngine): Promise<void> {
  if (installed) return
  installed = true

  const api: Record<string, ApiLeaf> = {
    log: luaLog,
    config: luaConfig,
    hooks: { on: hooks.on, off: hooks.off },
    async: { sleep },
    state: luaState,
    ui: luaUi,
    tool: luaTool,
    provider: luaProvider,
    agent: luaAgent,
    command: luaCommand,
    model: luaModel,
    lsp: luaLsp,
    fs: luaFs,
    system: luaSystem,
    session: luaSession,
    http: luaHttp,
    prompt: luaPrompt,
    review: luaReview,
    goal: luaGoal,
    version: () => "0.1.0",
    platform: () => process.platform,
  }

  engine.global.set("_xapi", api)
  await engine.doString(buildLuaXTable(api))

  const { ASYNC_WRAP_SNIPPET } = await import("./async")
  await engine.doString(ASYNC_WRAP_SNIPPET)

  hooks.bridgeEvents()
}

export function installLuaRequire(engine: LuaEngine, resolveModule: (name: string) => string | undefined): void {
  const cache = new Map<string, unknown>()
  engine.global.set("require", (name: string) => {
    if (cache.has(name)) return cache.get(name)
    const file = resolveModule(name)
    if (!file) return undefined
    const source = fs.readFileSync(file, "utf8")
    const result = engine.doStringSync(source)
    cache.set(name, result)
    return result
  })
}

export function resolveLuaModule(baseDirs: string[], name: string): string | undefined {
  const candidates = name.endsWith(".lua") ? [name] : [`${name}.lua`, path.join(name, "init.lua")]
  for (const dir of baseDirs) {
    for (const c of candidates) {
      const file = path.resolve(dir, c)
      if (fs.existsSync(file)) return file
    }
  }
  return undefined
}

export async function reloadXApi(engine: LuaEngine): Promise<void> {
  installed = false
  await installXApi(engine)
}
