import { loadConfig } from "../config/loader"
import type { Config } from "../config/schema"
import { PermissionEngine } from "./permission"
import { Store } from "../storage/db"
import { SessionManager } from "./session"
import { createDefaultRegistry } from "../tools/index"
import type { ToolRegistry } from "../tools/registry"

export interface Runtime {
  config: Config
  store: Store
  sessions: SessionManager
  permission: PermissionEngine
  registry: ToolRegistry
}

export async function createRuntime(opts?: {
  config?: Config
  yes?: boolean
}): Promise<Runtime> {
  const config = opts?.config ?? (await loadConfig())
  const store = Store.open()
  const sessions = new SessionManager(store)
  const permission = new PermissionEngine(config.permission, opts?.yes ? { defaultOverride: "allow" } : undefined)
  const registry = createDefaultRegistry()
  return { config, store, sessions, permission, registry }
}
