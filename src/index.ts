import { parseArgs } from "./cli/args"
import { banner } from "./cli/banner"
import { runRepl } from "./cli/repl"
import { runTask } from "./cli/run"
import { loadConfig, getByPath } from "./config/loader"
import { setOverride } from "./config/overrides"
import { configFilePath, ensureConfigDir } from "./config/paths"

const VERSION = "0.1.0"

const CONFIG_TEMPLATE = `-- ~/.config/xuanjian/xuanjian.lua
-- 玄鉴配置：本文件是 Lua 脚本，返回值即配置表。
return {
  model = "anthropic/claude-sonnet-4-5",
  default_agent = "build",
  theme = "dark",

  provider = {
    -- 自定义 OpenAI 兼容服务示例（DeepSeek/Qwen/智谱/Ollama...）
    -- deepseek = {
    --   type = "openai-compatible",
    --   base_url = "https://api.deepseek.com/v1",
    --   api_key_env = "DEEPSEEK_API_KEY",
    --   default_model = "deepseek-chat",
    --   models = { ["deepseek-chat"] = { name = "DeepSeek V3", context = 65536 } },
    -- },
  },

  permission = { default = "ask", allow = { "read", "glob", "grep" }, deny = {} },
  plugins = {},
}
`

function printHelp(): void {
  process.stdout.write(
    [
      banner(),
      "",
      "用法: xuanjian <command> [options]",
      "",
      "命令:",
      "  (无参数)               进入交互式 REPL",
      "  run <任务>             非交互模式执行任务",
      "  config init|path|get|set  配置管理",
      "  providers [id]         列出 provider / 模型",
      "  review [todo]          审查当前 git diff",
      "  goals list|status|resume|abort   goal 模式管理",
      "  plugins list           列出插件",
      "  lsp debug              LSP 调试",
      "  doctor                 环境检查",
      "",
      "选项:",
      "  -m, --model <id>       覆盖模型 (provider/model)",
      "  -a, --agent <id>       覆盖 agent",
      "  -p, --provider <id>    限制 provider",
      "  -d, --directory <path> 工作目录",
      "      --session-id <id>  指定/恢复会话",
      "  -c, --continue         继续最近会话",
      "  -y, --yes              自动允许权限",
      "  -h, --help             帮助",
      "  -v, --version          版本",
      "",
    ].join("\n"),
  )
}

async function handleConfig(sub: "init" | "path" | "get" | "set", key: string | undefined, value: string | undefined): Promise<void> {
  switch (sub) {
    case "init": {
      const file = configFilePath()
      ensureConfigDir()
      const { existsSync } = await import("node:fs")
      if (existsSync(file)) {
        process.stdout.write(`配置已存在: ${file}\n`)
        return
      }
      await import("node:fs").then((fs) => fs.writeFileSync(file, CONFIG_TEMPLATE))
      process.stdout.write(`已生成配置: ${file}\n`)
      return
    }
    case "path":
      process.stdout.write(configFilePath() + "\n")
      return
    case "get": {
      const config = await loadConfig()
      const value = getByPath(config, key ?? "")
      process.stdout.write(JSON.stringify(value, null, 2) + "\n")
      return
    }
    case "set": {
      if (!key) {
        process.stderr.write("config set 需要 key\n")
        process.exitCode = 1
        return
      }
      let parsed: unknown
      if (value === undefined || value === "true") parsed = true
      else if (value === "false") parsed = false
      else if (value === "null") parsed = null
      else {
        try {
          parsed = JSON.parse(value)
        } catch {
          parsed = value
        }
      }
      await setOverride(key, parsed)
      process.stdout.write(`已设置 ${key} = ${JSON.stringify(parsed)}\n`)
      return
    }
  }
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2))

  if (options.help && command.kind !== "help" && command.kind !== "version") {
    printHelp()
    return
  }

  switch (command.kind) {
    case "version":
      process.stdout.write(`玄鉴 Xuanjian ${VERSION}\n`)
      return
    case "help":
      printHelp()
      return
    case "repl":
      await runRepl(options)
      return
    case "run":
      process.exitCode = await runTask(command.message, options, command.goal)
      return
    case "config":
      await handleConfig(command.sub, command.key, command.value)
      return
    default:
      process.stdout.write(`命令 ${command.kind} 尚未实现（下一功能提交）\n`)
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
