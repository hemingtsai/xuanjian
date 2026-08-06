import fs from "node:fs"
import path from "node:path"
import type { PluginRef } from "../config/schema"
import { getLuaEngine } from "./engine"
import { installLuaRequire, resolveLuaModule } from "./api"
import { luaLog } from "./api/log"
import { pluginsDir } from "../config/paths"

export interface PluginLoadResult {
  name: string
  file: string
  ok: boolean
  error?: string
}

export function resolvePluginRef(ref: PluginRef, cwd: string): string | undefined {
  if (typeof ref === "string") {
    const candidates = [
      path.join(pluginsDir(), `${ref}.lua`),
      path.join(pluginsDir(), ref),
      path.join(cwd, ".xuanjian", "plugins", `${ref}.lua`),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
    return undefined
  }
  const file = ref.path
  return fs.existsSync(file) ? file : undefined
}

export async function loadPlugins(plugins: PluginRef[], cwd: string): Promise<PluginLoadResult[]> {
  if (plugins.length === 0) return []
  const engine = await getLuaEngine()
  const results: PluginLoadResult[] = []

  // 安装 require：从用户插件目录与项目插件目录解析
  const moduleDirs = [pluginsDir(), path.join(cwd, ".xuanjian", "plugins")]
  installLuaRequire(engine, (name) => resolveLuaModule(moduleDirs, name))

  for (const ref of plugins) {
    const name = typeof ref === "string" ? ref : path.basename(ref.path, ".lua")
    const file = resolvePluginRef(ref, cwd)
    if (!file) {
      results.push({ name, file: "", ok: false, error: `插件文件不存在` })
      luaLog.warn(`插件 ${name} 未找到，已跳过`)
      continue
    }
    try {
      const source = fs.readFileSync(file, "utf8")
      await engine.doString(source)
      results.push({ name, file, ok: true })
      luaLog.info(`已加载插件 ${name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ name, file, ok: false, error: message })
      luaLog.error(`插件 ${name} 加载失败: ${message}`)
    }
  }
  return results
}
