import path from "node:path"
import type { Options } from "./args"
import { createRuntime } from "../core/runtime"
import { resolveAgent } from "../core/agent"
import { runAgentTurn } from "../core/agent-loop"
import { StreamRenderer } from "./render"
import { toolSubject } from "../core/permission"
import type { PermissionRequest } from "../core/permission"

export async function runTask(message: string, options: Options, goal: string | undefined): Promise<number> {
  if (goal) {
    process.stdout.write(`goal 模式 "${goal}" 将在后续功能提交中实现。\n`)
    return 2
  }
  if (!message) {
    process.stderr.write("run 需要任务文本，例如: xuanjian run \"修复登录 bug\"\n")
    return 2
  }

  const cwd = options.directory ? path.resolve(process.cwd(), options.directory) : process.cwd()
  const runtime = await createRuntime({ yes: options.yes })
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
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`Error: ${message}\n`)
    return 1
  } finally {
    runtime.store.close()
  }
}
