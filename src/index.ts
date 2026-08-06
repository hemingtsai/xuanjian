import { parseArgs } from "./cli/args"
import { banner } from "./cli/banner"
import { runRepl } from "./cli/repl"
import { runTask } from "./cli/run"

const VERSION = "0.1.0"

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
    default:
      process.stdout.write(`命令 ${command.kind} 尚未实现（下一功能提交）\n`)
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
