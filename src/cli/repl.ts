import * as readline from "node:readline"
import path from "node:path"
import { banner } from "./banner"
import type { Options } from "./args"
import { createRuntime } from "../core/runtime"
import type { Runtime } from "../core/runtime"
import type { Session } from "../core/session"
import { resolveAgent } from "../core/agent"
import { runAgentTurn } from "../core/agent-loop"
import type { PermissionAnswer } from "../core/agent-loop"
import { StreamRenderer, statusLine } from "./render"
import { toolSubject } from "../core/permission"
import type { PermissionRequest } from "../core/permission"
import { getSlashHandler, registerSlash } from "../core/slash"

export interface Repl {
  readonly runtime: Runtime
  readonly session: Session
  readonly model: () => string | undefined
  readonly setModel: (id: string) => void
  readonly agent: () => string | undefined
  readonly setAgent: (id: string) => void
}

const PROMPT = "\x1b[90m玄鉴>\x1b[0m "

export async function runRepl(options: Options): Promise<void> {
  const cwd = options.directory ? path.resolve(process.cwd(), options.directory) : process.cwd()
  const runtime = await createRuntime({ yes: options.yes })

  let session =
    (options.sessionId ? runtime.sessions.load(options.sessionId) : undefined) ??
    (options.continueSession ? runtime.sessions.resumeLatest() : undefined)
  if (!session || session.cwd !== cwd) {
    session = runtime.sessions.create({ cwd, model: options.model, agent: options.agent })
  }

  const repl: Repl = {
    runtime,
    session,
    model: () => session.model ?? options.model,
    setModel: (id) => {
      session.setModel(id)
    },
    agent: () => session.agent ?? options.agent,
    setAgent: (id) => {
      session.setAgent(id)
    },
  }

  process.stdout.write(banner() + "\n\n")
  process.stdout.write(statusLine(repl.model() ?? "未设置") + "\n\n")

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: PROMPT })

  rl.on("SIGINT", () => {
    process.stdout.write("\n")
    rl.close()
    runtime.store.close()
    process.exit(130)
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
    const handler = getSlashHandler(name)
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

  const { runtime, session } = repl
  const agent = resolveAgent(session.agent, runtime.config)
  const model = repl.model()
  if (!model) {
    process.stdout.write("未配置模型。用 /model <provider/model> 指定，或在配置中设置 model。\n")
    rl.prompt()
    return
  }

  const renderer = new StreamRenderer(model)
  try {
    await runAgentTurn(line, {
      session,
      config: runtime.config,
      registry: runtime.registry,
      permission: runtime.permission,
      agent,
      model,
      sessionManager: runtime.sessions,
      lspManager: runtime.lsp,
      sink: renderer,
      askPermission: (req) => askPermissionInteractive(rl, req),
      askUser: (question) => askUserInteractive(rl, question),
    })
  } catch (err) {
    process.stdout.write(`\n\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m\n`)
  }
  rl.prompt()
}

function askUserInteractive(rl: readline.Interface, question: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    process.stdout.write(`\n\x1b[36m❓ ${question}\x1b[0m\n`)
    rl.question("\x1b[90m回答: \x1b[0m", (answer) => resolve(answer.trim() || undefined))
  })
}

function askPermissionInteractive(rl: readline.Interface, req: PermissionRequest): Promise<PermissionAnswer | undefined> {
  const subject = toolSubject(req.tool, req.args)
  return new Promise((resolve) => {
    process.stdout.write(`\n\x1b[33m⚠ 请求权限: ${req.tool}${subject ? ` ${subject}` : ""}\x1b[0m\n`)
    rl.question("\x1b[90m[y]允许 [n]拒绝 [a]本次会话 [s]总是: \x1b[0m", (answer) => {
      const a = answer.trim().toLowerCase()
      if (a === "y") resolve("allow")
      else if (a === "n") resolve("deny")
      else if (a === "a") resolve("session")
      else if (a === "s") resolve("always")
      else resolve("deny")
    })
  })
}

registerSlash("help", () => {
  return [
    "/help         帮助",
    "/model [id]   查看/切换模型",
    "/agent [id]   查看/切换 agent",
    "/goal \"目标\"  创建并执行 goal",
    "/review [todo] 触发审查流水线",
    "/compact      手动压缩上下文",
    "/clear        清屏",
    "/cost         显示 token/费用统计",
    "/state        显示会话状态",
    "/exit         退出",
  ].join("\n")
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

registerSlash("goal", async (args, repl) => {
  if (!args) return "用法: /goal \"目标描述\""
  const model = repl.model()
  if (!model) return "未配置模型，用 /model <provider/model> 指定。"
  const agent = resolveAgent(repl.session.agent, repl.runtime.config)
  const goal = repl.runtime.goals.create({ title: args, model, cwd: repl.session.cwd })
  process.stdout.write(`goal ${goal.id} 已创建，开始执行...\n`)
  const { executeGoal, formatGoalReport } = await import("../goal/loop")
  await executeGoal({ runtime: repl.runtime, goal, agent, model, sink: new StreamRenderer(model) })
  process.stdout.write("\n" + formatGoalReport(goal) + "\n")
  return undefined
})

registerSlash("compact", (_, repl) => {
  const removed = repl.session.compact(2, 20)
  return removed > 0 ? `已压缩 ${removed} 条消息。` : "消息数不足以压缩。"
})
registerSlash("cost", () => "费用统计将在后续功能提交中实现。")
registerSlash("review", async (args, repl) => {
  const model = repl.model()
  if (!model) return "未配置模型。"
  process.stdout.write("运行玄鉴审查流水线...\n")
  const { runReview } = await import("../review/pipeline")
  const output = await runReview({ todo: args, cwd: repl.session.cwd, config: repl.runtime.config, model, noAutoCommit: false })
  return output.report || "无变更或无匹配审查员。"
})
registerSlash("state", (_, repl) => {
  const count = repl.runtime.store.listMessages(repl.session.id).length
  return `会话 ${repl.session.id} · 工作目录 ${repl.session.cwd} · 消息数 ${count}`
})
registerSlash("clear", () => {
  process.stdout.write("\x1b[2J\x1b[H")
  return undefined
})
registerSlash("exit", () => {
  process.exit(0)
})
