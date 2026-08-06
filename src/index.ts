import { parseArgs } from "./cli/args"
import { banner } from "./cli/banner"
import { runTui } from "./tui/index"
import { runTask } from "./cli/run"
import { loadConfig, getByPath } from "./config/loader"
import { setOverride } from "./config/overrides"
import { configFilePath, ensureConfigDir } from "./config/paths"
import { listModels, listProviders } from "./llm/catalog"
import { runReview } from "./review/pipeline"
import { resolveAgent } from "./core/agent"
import { createRuntime } from "./core/runtime"
import { executeGoal, formatGoalReport } from "./goal/loop"
import { runDoctor } from "./cli/doctor"

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
      await runTui(options)
      return
    case "run":
      process.exitCode = await runTask(command.message, options, command.goal)
      return
    case "config":
      await handleConfig(command.sub, command.key, command.value)
      return
    case "providers": {
      const config = await loadConfig()
      if (command.id) {
        const models = listModels(command.id, config)
        if (models.length === 0) {
          process.stdout.write(`provider ${command.id} 无已知模型\n`)
          return
        }
        for (const m of models) {
          process.stdout.write(`${command.id}/${m.id}` + (m.name ? `  ${m.name}` : "") + (m.context ? `  (${m.context})` : "") + "\n")
        }
        return
      }
      for (const p of listProviders(config)) {
        process.stdout.write(`${p.id}  [${p.type}]` + (p.custom ? "  (自定义)" : "") + `  ${p.models} 模型\n`)
      }
      return
    }
    case "review": {
      const config = await loadConfig()
      const agent = resolveAgent(config.default_agent, config)
      const model = options.model ?? config.model ?? agent.model
      if (!model) {
        process.stderr.write("未配置模型。\n")
        process.exitCode = 2
        return
      }
      const cwd = options.directory ? await import("node:path").then((p) => p.resolve(process.cwd(), options.directory!)) : process.cwd()
      process.stdout.write("运行玄鉴审查流水线...\n")
      const output = await runReview({ todo: command.todo ?? "", cwd, config, model, noAutoCommit: command.noAutoCommit })
      if (output.report) process.stdout.write(output.report + "\n")
      else process.stdout.write("无变更或无匹配审查员。\n")
      return
    }
    case "goals": {
      const runtime = await createRuntime({ yes: options.yes })
      try {
        if (command.sub === "list") {
          const goals = runtime.goals.list()
          if (goals.length === 0) {
            process.stdout.write("暂无 goal。使用 `xuanjian run --goal \"目标\"` 创建。\n")
            return
          }
          for (const g of goals) {
            const done = g.tasks.filter((t) => t.status === "done").length
            process.stdout.write(`${g.id}  [${g.status}]  ${g.title}  (${done}/${g.tasks.length})\n`)
          }
          return
        }
        const id = command.id
        if (!id) {
          process.stderr.write(`goals ${command.sub} 需要 goal id\n`)
          process.exitCode = 1
          return
        }
        const goal = runtime.goals.load(id)
        if (!goal) {
          process.stderr.write(`goal 不存在: ${id}\n`)
          process.exitCode = 1
          return
        }
        if (command.sub === "status") {
          process.stdout.write(formatGoalReport(goal) + "\n")
        } else if (command.sub === "resume") {
          const model = options.model ?? goal.model
          await executeGoal({ runtime, goal, model })
          process.stdout.write(formatGoalReport(goal) + "\n")
        } else if (command.sub === "abort") {
          goal.status = "cancelled"
          runtime.goals.save(goal)
          process.stdout.write(`goal 已中止: ${id}\n`)
        }
      } finally {
        runtime.store.close()
      }
      return
    }
    case "plugins": {
      const config = await loadConfig()
      const { resolvePluginRef } = await import("./lua/loader")
      const cwd = options.directory ? await import("node:path").then((p) => p.resolve(process.cwd(), options.directory!)) : process.cwd()
      for (const ref of config.plugins) {
        const name = typeof ref === "string" ? ref : ref.path
        const file = resolvePluginRef(ref, cwd)
        process.stdout.write(`${name}: ${file ? file : "未找到"}\n`)
      }
      if (config.plugins.length === 0) process.stdout.write("未配置插件。\n")
      return
    }
    case "lsp": {
      const config = await loadConfig()
      const cwd = options.directory ? await import("node:path").then((p) => p.resolve(process.cwd(), options.directory!)) : process.cwd()
      const { LSPManager } = await import("./lsp/manager")
      const manager = new LSPManager(config, cwd)
      for (const lang of manager.debugInfo().languages) {
        const server = lang.server
        if (!server) {
          process.stdout.write(`- ${lang}: 未配置/已禁用\n`)
          continue
        }
        const status = lang.shuttered ? "（已禁用：连续失败）" : lang.running ? "（运行中）" : ""
        process.stdout.write(`- ${lang}: ${server.command} ${server.args.join(" ")} ${status}\n`)
      }
      return
    }
    case "doctor":
      process.exitCode = await runDoctor(options)
      return
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
