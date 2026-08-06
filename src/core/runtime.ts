import { loadConfig } from "../config/loader"
import type { Config } from "../config/schema"
import { PermissionEngine } from "./permission"
import { Store } from "../storage/db"
import { SessionManager } from "./session"
import { createDefaultRegistry } from "../tools/index"
import type { ToolRegistry } from "../tools/registry"
import { LSPManager } from "../lsp/manager"
import { GoalStore } from "../goal/goal"
import { setLuaContext, applyBufferedToConfig } from "../lua/api"
import { loadPlugins } from "../lua/loader"

export interface Runtime {
  config: Config
  store: Store
  sessions: SessionManager
  permission: PermissionEngine
  registry: ToolRegistry
  lsp: LSPManager
  goals: GoalStore
}

export async function createRuntime(opts?: {
  config?: Config
  yes?: boolean
  cwd?: string
}): Promise<Runtime> {
  const config = opts?.config ?? (await loadConfig())
  applyBufferedToConfig(config)
  const cwd = opts?.cwd ?? process.cwd()
  const store = Store.open()
  const sessions = new SessionManager(store)
  const permission = new PermissionEngine(config.permission, opts?.yes ? { defaultOverride: "allow" } : undefined)
  const registry = createDefaultRegistry()
  const lsp = new LSPManager(config, cwd)
  const goals = new GoalStore(store)
  const runtime: Runtime = { config, store, sessions, permission, registry, lsp, goals }

  setLuaContext({
    config,
    store,
    registry,
    lsp,
    sessions,
    goals,
    permission,
    cwd,
    runtime,
  })

  await loadPlugins(config.plugins, cwd)
  return runtime
}
