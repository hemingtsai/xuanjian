import type { Config } from "../config/schema"
import type { AgentInfo } from "./agent"
import { resolveAgent } from "./agent"
import type { Session } from "./session"
import * as Events from "./events"
import type { PermissionEngine } from "./permission"
import type { PermissionRequest } from "./permission"
import { PermissionEngine as PermissionEngineImpl } from "./permission"
import type { ToolRegistry } from "../tools/registry"
import { ToolRegistry as ToolRegistryImpl } from "../tools/registry"
import type { ExecuteResult } from "../tools/registry"
import type { SessionManager } from "./session"
import { complete } from "../llm/client"
import type { LLMEvent, ToolDef, LLMMessage } from "../llm/llm"
import { newUUID } from "./session"

export interface LoopSink {
  text(chunk: string): void
  reasoning(chunk: string): void
  toolStart(tool: string, args: Record<string, unknown>): void
  toolEnd(tool: string, result: { title: string; output: string }): void
  error(message: string): void
  done(text: string): void
}

export type PermissionAnswer = "allow" | "deny" | "session" | "always"

export interface LoopOptions {
  session: Session
  config: Config
  registry: ToolRegistry
  permission: PermissionEngine
  agent?: AgentInfo
  model?: string
  sessionManager?: SessionManager
  sink?: Partial<LoopSink>
  askPermission?: (req: PermissionRequest) => Promise<PermissionAnswer | undefined>
  askUser?: (question: string) => Promise<string | undefined>
  abort?: AbortSignal
}

export interface TurnResult {
  text: string
  iterations: number
}

const MAX_ITERATIONS = 40

function selectTools(registry: ToolRegistry, agent: AgentInfo): ToolDef[] {
  const whitelist = agent.tools
  const tools = registry.list()
  if (!whitelist || whitelist.includes("*")) return tools.map(t => ({ name: t.id, description: t.description, parameters: t.parameters }))
  return tools.filter((t) => whitelist.includes(t.id)).map((t) => ({ name: t.id, description: t.description, parameters: t.parameters }))
}

export async function runAgentTurn(input: string, opts: LoopOptions): Promise<TurnResult> {
  const { session, config, registry, permission } = opts
  const agent = opts.agent ?? resolveAgent(session.agent, config)
  const model = opts.model ?? session.model ?? agent.model ?? config.model
  if (!model) {
    throw new Error("未配置模型。请在 ~/.config/xuanjian.lua 设置 model，或使用 --model / /model 指定。")
  }
  const sink = opts.sink ?? {}
  const abort = opts.abort

  session.addMessage({ role: "user", content: input })
  await Events.emit("message.user", { session_id: session.id, text: input })

  const tools = selectTools(registry, agent)
  const toolMap = new Map(registry.list().map((t) => [t.id, t]))

  const subagent = opts.sessionManager
    ? async (subInput: { description: string; agent?: string; model?: string }) => {
        const subAgent = subInput.agent ? resolveAgent(subInput.agent, opts.config) : undefined
        const subModel = subInput.model ?? subAgent?.model ?? model
        const subSession = opts.sessionManager!.create({ cwd: session.cwd, model: subModel, agent: subInput.agent })
        const subRegistry = restrictedSubregistry(registry)
        const result = await runAgentTurn(subInput.description, {
          session: subSession,
          config: opts.config,
          registry: subRegistry,
          permission: new PermissionEngineImpl(opts.config.permission, { defaultOverride: "deny" }),
          agent: subAgent,
          model: subModel,
          sessionManager: undefined,
          sink: { done: () => {} },
          abort,
        })
        return result
      }
    : undefined

  const toolContext = {
    cwd: session.cwd,
    sessionID: session.id,
    abort,
    ask: opts.askUser,
    extra: { subagent } as Record<string, unknown>,
  }

  let iterations = 0
  let finalText = ""

  while (iterations < MAX_ITERATIONS) {
    iterations++
    if (abort?.aborted) throw new Error("已中止")

    const messages: LLMMessage[] = session.toLLMMessages()

    const toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = []
    let streamedText = ""

    for await (const event of complete(model, { system: agent.system_prompt, messages, tools, signal: abort }, config)) {
      if (abort?.aborted) throw new Error("已中止")
      switch (event.type) {
        case "text":
          streamedText += event.text
          sink.text?.(event.text)
          break
        case "reasoning":
          sink.reasoning?.(event.text)
          break
        case "tool_call":
          toolCalls.push({ id: event.id, name: event.name, args: event.args })
          break
        case "error":
          sink.error?.(event.message)
          throw new Error(event.message)
        case "done":
          break
      }
    }

    if (toolCalls.length === 0) {
      finalText = streamedText
      session.addMessage({ role: "assistant", content: streamedText })
      await Events.emit("message.assistant", { session_id: session.id, text: streamedText })
      sink.done?.(streamedText)
      return { text: finalText, iterations }
    }

    session.addMessage({ role: "assistant", content: streamedText, toolCalls })
    await Events.emit("message.assistant", { session_id: session.id, text: streamedText })

    for (const call of toolCalls) {
      const outcome = permission.decide({ tool: call.name, args: call.args, sessionID: session.id })
      await Events.emit("permission.request", { tool: call.name, args: call.args, mode: outcome.mode })
      let allowed = outcome.decision === "allow"
      if (outcome.decision === "ask") {
        if (opts.askPermission) {
          const answer = await opts.askPermission({ tool: call.name, args: call.args, sessionID: session.id })
          if (answer === "allow") allowed = true
          else if (answer === "session") {
            allowed = true
            permission.allowForSession(`bash:${toolSubject(call)}`)
          } else if (answer === "always") {
            allowed = true
            opts.config.permission.allow = [...(opts.config.permission.allow ?? []), `bash:${toolSubject(call)}`]
          }
        } else {
          allowed = false
        }
      }

      if (!allowed) {
        const reason = outcome.matchedRule ? `（规则: ${outcome.matchedRule}）` : ""
        const result = { title: "拒绝", output: `权限被拒绝${reason}，未执行 ${call.name}` }
        sink.toolStart?.(call.name, call.args)
        sink.toolEnd?.(call.name, result)
        session.addMessage({ role: "tool", content: result.output, toolCallId: call.id })
        await Events.emit("tool.before_call", { tool: call.name, args: call.args, session_id: session.id })
        await Events.emit("tool.after_call", { tool: call.name, args: call.args, result })
        continue
      }

      const tool = toolMap.get(call.name)
      sink.toolStart?.(call.name, call.args)
      await Events.emit("tool.before_call", { tool: call.name, args: call.args, session_id: session.id })
      let result: ExecuteResult
      try {
        result = await tool!.call(toolContext, call.args)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result = { title: call.name, output: `工具错误: ${message}` }
      }
      sink.toolEnd?.(call.name, result)
      session.addMessage({ role: "tool", content: result.output, toolCallId: call.id })
      await Events.emit("tool.after_call", { tool: call.name, args: call.args, result })
    }
  }

  finalText = `已达到最大迭代次数 (${MAX_ITERATIONS})，任务中断。`
  sink.done?.(finalText)
  return { text: finalText, iterations }
}

function toolSubject(call: { name: string; args: Record<string, unknown> }): string {
  if (call.name === "bash") {
    const cmd = call.args.command
    if (typeof cmd === "string") return cmd.trim()
  }
  return ""
}

const SUBAGENT_TOOLS = new Set(["read", "glob", "grep", "webfetch", "lsp_definition", "lsp_symbols", "lsp_references", "lsp_hover", "lsp_diagnostics"])

function restrictedSubregistry(registry: ToolRegistry): ToolRegistry {
  const sub = new ToolRegistryImpl()
  for (const tool of registry.list()) {
    if (SUBAGENT_TOOLS.has(tool.id)) sub.register(tool)
  }
  return sub
}
