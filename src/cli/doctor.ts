import fs from "node:fs"
import { spawnSync } from "node:child_process"
import { loadConfig } from "../config/loader"
import { configFilePath } from "../config/paths"
import { BUILTIN_PROVIDERS } from "../llm/providers"
import { resolvePluginRef } from "../lua/loader"
import { DEFAULT_SERVERS } from "../lsp/servers"
import type { Options } from "./args"

function check(command: string): string | undefined {
  const { status } = spawnSync(command, ["--version"], { stdio: "ignore" })
  return status === 0 ? "OK" : undefined
}

export async function runDoctor(options: Options): Promise<number> {
  const lines: string[] = ["玄鉴环境检查", "=".repeat(24)]
  let ok = true

  lines.push(`- Bun 运行时: ${process.version}`)

  // 配置
  try {
    const config = await loadConfig()
    lines.push(`- 配置解析: OK (${configFilePath()})`)
    lines.push(`- 默认模型: ${config.model ?? "（未设置）"}`)
    lines.push(`- 默认 agent: ${config.default_agent ?? "build"}`)
  } catch (err) {
    lines.push(`- 配置解析: 失败 (${err instanceof Error ? err.message : String(err)})`)
    ok = false
  }

  // Provider API key
  const config = await loadConfig().catch(() => undefined)
  for (const provider of BUILTIN_PROVIDERS) {
    const env = config?.provider[provider.id]?.api_key_env ?? provider.api_key_env
    if (!env) continue
    const set = process.env[env] !== undefined
    lines.push(`- provider ${provider.id}: ${set ? "API key 已配置" : `缺少 ${env}`}`)
    if (!set) ok = false
  }
  for (const [id, entry] of Object.entries(config?.provider ?? {})) {
    if (BUILTIN_PROVIDERS.some((p) => p.id === id)) continue
    if (entry.api_key_env && !process.env[entry.api_key_env]) {
      lines.push(`- provider ${id}: 缺少 ${entry.api_key_env}`)
      ok = false
    } else {
      lines.push(`- provider ${id}: OK`)
    }
  }

  // LSP 服务器
  lines.push("")
  lines.push("LSP 服务器:")
  for (const [lang, server] of Object.entries(DEFAULT_SERVERS)) {
    const found = check(server.command)
    lines.push(`- ${lang}: ${found ?? "未安装"}`)
  }

  // 插件
  lines.push("")
  lines.push("插件:")
  for (const ref of config?.plugins ?? []) {
    const name = typeof ref === "string" ? ref : ref.path
    const file = resolvePluginRef(ref, options.directory ? fs.realpathSync(options.directory) : process.cwd())
    lines.push(`- ${name}: ${file ? `OK (${file})` : "未找到"}`)
  }

  process.stdout.write(lines.join("\n") + "\n")
  return ok ? 0 : 1
}
