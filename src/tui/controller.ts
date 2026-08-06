import { createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { Runtime } from "../core/runtime"
import type { Session } from "../core/session"
import { resolveAgent } from "../core/agent"
import { runAgentTurn } from "../core/agent-loop"
import type { PermissionAnswer } from "../core/agent-loop"
import type { PermissionRequest } from "../core/permission"
import { toolSubject } from "../core/permission"
import { getSlashHandler } from "../core/slash"
import { TuiOutput, createTuiSink } from "./parts"
import { buildStatus, type StatusInfo } from "./status"
import { loginTargets } from "../cli/auth"
import { hasApiKey } from "../config/credentials"

export type TuiModal =
  | { kind: "permission"; text: string; resolve: (v: PermissionAnswer) => void }
  | { kind: "ask"; text: string; resolve: (v: string | undefined) => void }
  | { kind: "select"; title: string; options: { name: string; description: string; value: string }[]; resolve: (v: string | undefined) => void }

export class TuiController {
  readonly out: TuiOutput
  readonly runtime: Runtime
  readonly session: Session
  readonly status: Accessor<StatusInfo>
  readonly setStatus: Setter<StatusInfo>
  readonly modal: Accessor<TuiModal | null>
  readonly setModal: Setter<TuiModal | null>
  readonly busy: Accessor<boolean>
  private setBusy: Setter<boolean>
  private history: string[] = []
  private hIndex = -1
  private abortCtrl: AbortController | null = null
  onExit: (() => void) | null = null

  constructor(
    runtime: Runtime,
    session: Session,
  ) {
    this.runtime = runtime
    this.session = session
    this.out = new TuiOutput()
    const [status, setStatus] = createSignal<StatusInfo>(this.computeStatus())
    this.status = status
    this.setStatus = setStatus
    const [modal, setModal] = createSignal<TuiModal | null>(null)
    this.modal = modal
    this.setModal = setModal
    const [busy, setBusy] = createSignal(false)
    this.busy = busy
    this.setBusy = setBusy
  }

  exit(): void {
    this.onExit?.()
  }

  private computeStatus(): StatusInfo {
    const chars = this.session.messages().reduce((sum, m) => sum + m.content.length, 0)
    const goalActive = this.runtime.goals.list().some((g) => g.status === "active" || g.status === "planning")
    return buildStatus({
      config: this.runtime.config,
      model: this.session.model,
      agent: this.session.agent,
      cwd: this.session.cwd,
      lsp: this.runtime.lsp,
      goalActive,
      chars,
    })
  }

  refreshStatus(): void {
    this.setStatus(this.computeStatus())
  }

  async submit(raw: string): Promise<void> {
    const text = raw.trim()
    if (!text || this.busy()) return
    this.pushHistory(text)
    this.out.push({ type: "user", text })
    if (text.startsWith("/")) {
      await this.handleSlash(text)
      this.refreshStatus()
      return
    }
    const { runtime, session } = this
    const agent = resolveAgent(session.agent, runtime.config)
    const model = session.model ?? agent.model ?? runtime.config.model
    if (!model) {
      this.out.push({ type: "error", text: "未配置模型。用 /model <provider/model> 指定，或在配置中设置 model。" })
      return
    }
    this.abortCtrl = new AbortController()
    this.setBusy(true)
    try {
      await runAgentTurn(text, {
        session,
        config: runtime.config,
        registry: runtime.registry,
        permission: runtime.permission,
        agent,
        model,
        sessionManager: runtime.sessions,
        lspManager: runtime.lsp,
        sink: createTuiSink(this.out),
        askPermission: (req) => this.askPermission(req),
        askUser: (q) => this.askUser(q),
        abort: this.abortCtrl.signal,
      })
    } catch (err) {
      if (this.abortCtrl.signal.aborted) {
        this.out.push({ type: "system", text: "已中断" })
      } else {
        this.out.push({ type: "error", text: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      this.setBusy(false)
      this.abortCtrl = null
    }
    this.refreshStatus()
  }

  askPermission(req: PermissionRequest): Promise<PermissionAnswer | undefined> {
    if (this.modal()) return Promise.resolve(undefined)
    const subject = toolSubject(req.tool, req.args)
    return new Promise<PermissionAnswer>((resolve) => {
      this.setModal({ kind: "permission", text: `请求权限: ${req.tool}${subject ? ` ${subject}` : ""}`, resolve })
    })
  }

  askUser(question: string): Promise<string | undefined> {
    if (this.modal()) return Promise.resolve(undefined)
    return new Promise<string | undefined>((resolve) => {
      this.setModal({ kind: "ask", text: question, resolve })
    })
  }

  selectFromList(title: string, options: { name: string; description: string; value: string }[]): Promise<string | undefined> {
    if (this.modal()) return Promise.resolve(undefined)
    return new Promise<string | undefined>((resolve) => {
      this.setModal({ kind: "select", title, options, resolve })
    })
  }

  needsOnboarding(): boolean {
    if (this.runtime.config.model) return false
    return !loginTargets(this.runtime.config).some((t) => {
      if (t.apiKeyEnv && process.env[t.apiKeyEnv]) return true
      return hasApiKey(t.id)
    })
  }

  async openAuthWizard(): Promise<void> {
    const { loginTargets } = await import("../cli/auth")
    const { hasApiKey } = await import("../config/credentials")
    const targets = loginTargets(this.runtime.config)
    const connected = new Set(targets.filter((t) => hasApiKey(t.id)).map((t) => t.id))
    const providerId = await this.selectFromList(
      "选择要连接的 provider",
      targets.map((t) => ({
        name: t.id + (connected.has(t.id) ? " ✓" : ""),
        description: t.label,
        value: t.id,
      })),
    )
    if (!providerId) return
    const target = targets.find((t) => t.id === providerId)
    if (!target) return
    const apiKey = await this.askUser(`输入 ${providerId} 的 API key：`)
    if (!apiKey || !apiKey.trim()) {
      this.out.push({ type: "system", text: `已取消连接 ${providerId}` })
      return
    }
    const { setCredential } = await import("../config/credentials")
    setCredential(providerId, { apiKey: apiKey.trim() })
    this.out.push({ type: "system", text: `✓ 已连接 ${providerId}` })
    if (!this.runtime.config.model && target.defaultModel) {
      const { setOverride } = await import("../config/overrides")
      await setOverride("model", target.defaultModel)
      this.runtime.config.model = target.defaultModel
      this.out.push({ type: "system", text: `默认模型已设为 ${target.defaultModel}` })
    }
    this.refreshStatus()
  }

  resolveModal(value: unknown): void {
    const m = this.modal()
    if (!m) return
    this.setModal(null)
    if (m.kind === "permission") {
      m.resolve(value as PermissionAnswer)
    } else {
      m.resolve(value === "" ? undefined : String(value))
    }
  }

  cancelModal(): void {
    const m = this.modal()
    if (!m) return
    this.setModal(null)
    if (m.kind === "permission") m.resolve("deny")
    else m.resolve(undefined)
  }

  private async handleSlash(text: string): Promise<void> {
    const space = text.indexOf(" ")
    const name = space === -1 ? text.slice(1) : text.slice(1, space)
    const args = space === -1 ? "" : text.slice(space + 1).trim()
    const handler = getSlashHandler(name)
    if (!handler) {
      this.out.push({ type: "error", text: `未知斜杠命令 /${name}，输入 /help 查看。` })
      return
    }
    try {
      const result = await handler(args, undefined)
      if (result && typeof result === "string") this.out.push({ type: "system", text: result })
    } catch (err) {
      this.out.push({ type: "error", text: `命令执行失败: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  pushHistory(text: string): void {
    this.history.push(text)
    this.hIndex = this.history.length
  }

  historyPrev(): string | undefined {
    if (this.history.length === 0) return undefined
    this.hIndex = Math.max(0, this.hIndex - 1)
    return this.history[this.hIndex]
  }

  historyNext(): string | undefined {
    this.hIndex = Math.min(this.history.length, this.hIndex + 1)
    return this.hIndex >= this.history.length ? "" : this.history[this.hIndex]
  }

  interrupt(): void {
    this.abortCtrl?.abort()
  }

  clearOutput(): void {
    this.out.clear()
  }
}
