import path from "node:path"
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import { logoColumns, bannerTitle } from "../cli/banner"
import type { Options } from "../cli/args"
import { createRuntime } from "../core/runtime"
import { resolveAgent } from "../core/agent"
import { registerSlash } from "../core/slash"
import { executeGoal, formatGoalReport } from "../goal/loop"
import { runReview } from "../review/pipeline"
import { App } from "./App"
import { TuiController } from "./controller"

export async function runTui(options: Options): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stdout.write("交互模式需要 TTY 终端。非交互请使用: xuanjian run \"任务\"\n")
    return
  }

  const cwd = options.directory ? path.resolve(process.cwd(), options.directory) : process.cwd()
  const runtime = await createRuntime({ yes: options.yes })

  let session =
    (options.sessionId ? runtime.sessions.load(options.sessionId) : undefined) ??
    (options.continueSession ? runtime.sessions.resumeLatest() : undefined)
  if (!session || session.cwd !== cwd) {
    session = runtime.sessions.create({ cwd, model: options.model, agent: options.agent })
  }

  const controller = new TuiController(runtime, session)
  const cols = logoColumns()
  controller.out.push({ type: "banner", leading: cols.leading, main: cols.main, title: bannerTitle() })
  registerTuiSlash(controller)

  const renderer = await createCliRenderer({ exitOnCtrlC: false })
  controller.onExit = () => exit(renderer, runtime)
  await render(() => <App controller={controller} />, renderer)
}

function exit(renderer: import("@opentui/core").CliRenderer, runtime: import("../core/runtime").Runtime): void {
  renderer.destroy()
  setTimeout(() => {
    runtime.store.close()
    process.exit(0)
  }, 30)
}

function registerTuiSlash(controller: TuiController): void {
  const out = controller.out
  const runtime = controller.runtime
  const session = controller.session

  registerSlash("help", () => {
    return [
      "/help         帮助",
      "/model [id]   查看/切换模型",
      "/agent [id]   查看/切换 agent",
      "/goal \"目标\"  创建并执行 goal",
      "/review [todo] 触发审查流水线",
      "/compact      压缩上下文",
      "/clear        清空输出",
      "/cost         上下文用量",
      "/state        会话状态",
      "/exit         退出",
    ].join("\n")
  })

  registerSlash("model", (args) => {
    if (!args) return `当前模型: ${session.model ?? "（未设置）"}`
    session.setModel(args)
    controller.refreshStatus()
    return `已切换模型: ${args}`
  })

  registerSlash("agent", (args) => {
    if (!args) return `当前 agent: ${session.agent ?? "（未设置）"}`
    session.setAgent(args)
    controller.refreshStatus()
    return `已切换 agent: ${args}`
  })

  registerSlash("goal", async (args) => {
    if (!args) return "用法: /goal \"目标描述\""
    const model = session.model ?? runtime.config.model
    if (!model) return "未配置模型，用 /model <provider/model> 指定。"
    const agent = resolveAgent(session.agent, runtime.config)
    const goal = runtime.goals.create({ title: args, model, cwd: session.cwd })
    out.push({ type: "system", text: `goal ${goal.id} 已创建，开始执行...` })
    await executeGoal({
      runtime,
      goal,
      agent,
      model,
      sink: { text: (t) => out.push({ type: "text", text: t }), done: () => {} },
      askPermission: async () => "allow",
    })
    out.push({ type: "system", text: "\n" + formatGoalReport(goal) })
    controller.refreshStatus()
    return undefined
  })

  registerSlash("review", async (args) => {
    const model = session.model ?? runtime.config.model
    if (!model) return "未配置模型。"
    out.push({ type: "system", text: "运行玄鉴审查流水线..." })
    const output = await runReview({ todo: args, cwd: session.cwd, config: runtime.config, model, noAutoCommit: false })
    return output.report || "无变更或无匹配审查员。"
  })

  registerSlash("compact", () => {
    const removed = session.compact(2, 20)
    controller.refreshStatus()
    return removed > 0 ? `已压缩 ${removed} 条消息。` : "消息数不足以压缩。"
  })

  registerSlash("clear", () => {
    controller.clearOutput()
    return undefined
  })

  registerSlash("cost", () => `上下文: ${controller.status().ctx}`)

  registerSlash("state", () => `会话 ${session.id} · 工作目录 ${session.cwd} · 消息数 ${session.messages().length}`)

  registerSlash("exit", () => {
    controller.exit()
    return undefined
  })
}
