import path from "node:path"
import type { Options } from "./args"
import { loadConfig } from "../config/loader"
import { createRuntime } from "../core/runtime"
import { resolveAgent } from "../core/agent"
import { runAgentTurn } from "../core/agent-loop"
import { StreamRenderer } from "./render"
import { toolSubject } from "../core/permission"
import type { PermissionRequest } from "../core/permission"
import { executeGoal, formatGoalReport } from "../goal/loop"
import { flushOverrides } from "../config/overrides"

export async function runTask(message: string, options: Options, goal: string | undefined): Promise<number> {
  if (!message && !goal) {
    process.stderr.write("run 需要任务文本，例如: xuanjian run \"修复登录 bug\"，或 --goal \"目标\"\n")
    return 2
  }

  const config = await loadConfig()
  const cwd = options.directory ? path.resolve(process.cwd(), options.directory) : (config.workspace ?? process.cwd())
  const runtime = await createRuntime({ config, yes: options.yes, cwd })

  if (goal) {
    const model = options.model ?? runtime.config.model
    if (!model) {
      process.stderr.write("未配置模型。请在 ~/.config/xuanjian.lua 设置 model，或使用 --model 指定。\n")
      runtime.store.close()
      return 2
    }
    const agent = resolveAgent(options.agent, runtime.config)
    const goalObj = runtime.goals.create({ title: goal, model, cwd })
    const renderer = new StreamRenderer(model)
    try {
      await executeGoal({
        runtime,
        goal: goalObj,
        agent,
        model,
        sink: renderer,
        askPermission: !process.stdout.isTTY ? async () => (options.yes ? "allow" : undefined) : undefined,
      })
      process.stdout.write("\n" + formatGoalReport(goalObj) + "\n")
      return goalObj.status === "done" ? 0 : 2
    } finally {
      runtime.store.close()
    }
  }

  let session =
    (options.sessionId ? runtime.sessions.load(options.sessionId) : undefined) ??
    (options.continueSession ? runtime.sessions.resumeLatest() : undefined)
  if (!session || session.cwd !== cwd) {
    session = runtime.sessions.create({ cwd, model: options.model, agent: options.agent })
  }

  const agent = resolveAgent(options.agent ?? session.agent, runtime.config)
  const model = options.model ?? session.model ?? agent.model ?? runtime.config.model
  if (!model) {
    process.stderr.write("未配置模型。请在 ~/.config/xuanjian.lua 设置 model，或使用 --model 指定。\n")
    return 2
  }

  const renderer = new StreamRenderer(model)
  const nonInteractive = !process.stdout.isTTY

  try {
    const result = await runAgentTurn(message, {
      session,
      config: runtime.config,
      registry: runtime.registry,
      permission: runtime.permission,
      agent,
      model,
      sessionManager: runtime.sessions,
      lspManager: runtime.lsp,
      todos: runtime.todos,
      sink: renderer,
      askPermission: nonInteractive
        ? async (req: PermissionRequest) => {
            const subject = toolSubject(req.tool, req.args)
            process.stdout.write(`[run] 请求权限: ${req.tool} ${subject}\n`)
            return options.yes ? "allow" : undefined
          }
        : undefined,
    })
    if (nonInteractive && result.text) process.stdout.write(result.text.endsWith("\n") ? "" : "\n")
    if (options.review) {
      const { runReview } = await import("../review/pipeline")
      process.stdout.write("\n运行玄鉴审查流水线...\n")
      const output = await runReview({ todo: message, cwd, config: runtime.config, model })
      if (output.report) process.stdout.write(output.report + "\n")
    }
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`Error: ${message}\n`)
    return 1
  } finally {
    await flushOverrides()
    runtime.store.close()
  }
}
