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
let configLoading = false

/** 配置脚本加载期间：x 注册一律走缓冲，避免写入旧 runtime */
export function beginConfigLoad(): void {
  configLoading = true
}

export function endConfigLoad(): void {
  configLoading = false
}

export function isConfigLoading(): boolean {
  return configLoading
}

export function setLuaContext(context: LuaContext | undefined): void {
  ctx = context
  if (ctx) flushPending(ctx)
}

export function getLuaContext(): LuaContext | undefined {
  return ctx
}

/** 注册路径用：配置加载期强制返回 undefined（走缓冲） */
export function liveContext(): LuaContext | undefined {
  return configLoading ? undefined : ctx
}

export function requireLuaContext(): LuaContext {
  if (!ctx) throw new Error("Lua API 上下文尚未初始化")
  return ctx
}

type PendingTool = import("../../tools/registry").ToolDef
type PendingCommand = { name: string; fn: (args: string) => string | Promise<string | void> | undefined }
type PendingProvider = { id: string; entry: import("../../config/schema").ProviderEntry }
type PendingAgent = { id: string; entry: import("../../config/schema").AgentConfig }
type PendingModel = { providerID: string; modelID: string; info: import("../../config/schema").ModelInfo }
type PendingReviewer = import("../../config/schema").ReviewerConfig

const pending = {
  tools: [] as PendingTool[],
  commands: [] as PendingCommand[],
  providers: [] as PendingProvider[],
  agents: [] as PendingAgent[],
  models: [] as PendingModel[],
  reviewers: [] as PendingReviewer[],
}

export function bufferTool(tool: PendingTool): void {
  pending.tools.push(tool)
}
export function bufferCommand(name: string, fn: PendingCommand["fn"]): void {
  pending.commands.push({ name, fn })
}
export function bufferProvider(id: string, entry: PendingProvider["entry"]): void {
  pending.providers.push({ id, entry })
}
export function bufferAgent(id: string, entry: PendingAgent["entry"]): void {
  pending.agents.push({ id, entry })
}
export function bufferModel(providerID: string, modelID: string, info: PendingModel["info"]): void {
  pending.models.push({ providerID, modelID, info })
}
export function bufferReviewer(entry: PendingReviewer): void {
  pending.reviewers.push(entry)
}

export function applyBufferedToConfig(config: Config): void {
  for (const { id, entry } of pending.providers) config.provider[id] = entry
  for (const { id, entry } of pending.agents) config.agents[id] = entry
  for (const { providerID, modelID, info } of pending.models) {
    const provider = config.provider[providerID]
    if (provider) provider.models = { ...(provider.models ?? {}), [modelID]: info }
  }
  for (const entry of pending.reviewers) {
    config.review.reviewers = [...(config.review.reviewers ?? []).filter((r) => r.name !== entry.name), entry]
  }
  pending.providers = []
  pending.agents = []
  pending.models = []
  pending.reviewers = []
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
      registerSlash(name, fn)
    } catch {
      // REPL 命令注册失败不影响启动
    }
  }
  pending.commands = []
}
