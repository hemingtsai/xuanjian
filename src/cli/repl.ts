import * as readline from "node:readline"
import { banner } from "./banner"
import type { Options } from "./args"

export interface Repl {
  readonly model: () => string | undefined
  readonly setModel: (id: string) => void
  readonly agent: () => string | undefined
  readonly setAgent: (id: string) => void
  readonly options: Options
}

type SlashHandler = (args: string, repl: Repl) => string | Promise<string | void> | undefined

const slashCommands = new Map<string, SlashHandler>()

export function registerSlash(name: string, handler: SlashHandler): void {
  slashCommands.set(name, handler)
}

const PROMPT = "\x1b[90m玄鉴>\x1b[0m "

export async function runRepl(options: Options): Promise<void> {
  const repl: Repl = {
    model: () => options.model,
    setModel: (id) => {
      options.model = id
    },
    agent: () => options.agent,
    setAgent: (id) => {
      options.agent = id
    },
    options,
  }

  process.stdout.write(banner() + "\n\n")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT })

  rl.on("SIGINT", () => {
    process.stdout.write("\n")
    rl.close()
  })

  rl.on("line", (raw) => {
    const line = raw.trim()
    if (line.length === 0) {
      rl.prompt()
      return
    }
    void handleLine(rl, repl, line)
  })

  rl.prompt()
}

async function handleLine(rl: readline.Interface, repl: Repl, line: string): Promise<void> {
  if (line.startsWith("/")) {
    const space = line.indexOf(" ")
    const name = space === -1 ? line.slice(1) : line.slice(1, space)
    const args = space === -1 ? "" : line.slice(space + 1).trim()
    const handler = slashCommands.get(name)
    if (!handler) {
      process.stdout.write(`未知斜杠命令 /${name}，输入 /help 查看。\n`)
      rl.prompt()
      return
    }
    try {
      const result = await handler(args, repl)
      if (result && typeof result === "string") process.stdout.write(result + "\n")
    } catch (err) {
      process.stdout.write(`命令执行失败: ${err instanceof Error ? err.message : String(err)}\n`)
    }
    rl.prompt()
    return
  }

  process.stdout.write("会话尚未实现（agent loop 将在后续功能提交中接入）。\n")
  rl.prompt()
}

registerSlash("help", () => {
  const list = [
    "/help         帮助",
    "/model [id]   查看/切换模型",
    "/agent [id]   查看/切换 agent",
    "/compact      手动压缩上下文",
    "/clear        清屏",
    "/cost         显示 token/费用统计",
    "/state        显示会话状态",
    "/exit         退出",
  ].join("\n")
  return list
})

registerSlash("model", (args, repl) => {
  if (!args) return `当前模型: ${repl.model() ?? "（未设置）"}`
  repl.setModel(args)
  return `已切换模型: ${args}`
})

registerSlash("agent", (args, repl) => {
  if (!args) return `当前 agent: ${repl.agent() ?? "（未设置）"}`
  repl.setAgent(args)
  return `已切换 agent: ${args}`
})

registerSlash("compact", () => "上下文压缩将在后续功能提交中实现。")
registerSlash("cost", () => "费用统计将在后续功能提交中实现。")
registerSlash("state", () => "会话状态将在后续功能提交中实现。")
registerSlash("clear", () => {
  process.stdout.write("\x1b[2J\x1b[H")
  return undefined
})
registerSlash("exit", () => {
  process.exit(0)
})
