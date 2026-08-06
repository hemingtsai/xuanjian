import type { Config } from "../../config/schema"
import type { Store } from "../../storage/db"
import type { ToolRegistry } from "../../tools/registry"
import type { LSPManager } from "../../lsp/manager"
import type { SessionManager } from "../../core/session"
import type { GoalStore } from "../../goal/goal"
import type { PermissionEngine } from "../../core/permission"
import type { Runtime } from "../../core/runtime"
import { registerSlash } from "../../core/slash"

export interface LuaContext {
  config: Config
  store: Store
  registry: ToolRegistry
  lsp: LSPManager
  sessions: SessionManager
  goals: GoalStore
  permission: PermissionEngine
  cwd: string
  askUser?: (question: string) => Promise<string | undefined>
  runtime: Runtime
}

let ctx: LuaContext | undefined

export function setLuaContext(context: LuaContext | undefined): void {
  ctx = context
  if (ctx) flushPending(ctx)
}

export function getLuaContext(): LuaContext | undefined {
  return ctx
}

export function requireLuaContext(): LuaContext {
  if (!ctx) throw new Error("Lua API 上下文尚未初始化")
  return ctx
}

type PendingRegistrations = {
  tools: import("../../tools/registry").ToolDef[]
  commands: { name: string; fn: unknown }[]
}

const pending: PendingRegistrations = { tools: [], commands: [] }

export function bufferTool(tool: import("../../tools/registry").ToolDef): void {
  pending.tools.push(tool)
}

export function bufferCommand(name: string, fn: unknown): void {
  pending.commands.push({ name, fn })
}

export function flushPending(ctx: LuaContext): void {
  for (const tool of pending.tools) {
    try {
      ctx.registry.registerOrReplace(tool)
    } catch {
      // 忽略重复注册
    }
  }
  pending.tools = []
  for (const { name, fn } of pending.commands) {
    try {
      registerSlash(name, fn as (args: string) => string | Promise<string | void> | undefined)
    } catch {
      // REPL 命令注册失败不影响启动
    }
  }
  pending.commands = []
}
