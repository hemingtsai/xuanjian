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
import { setOverride } from "../config/overrides"
import { LSPManager } from "../lsp/manager"

export type TuiModal =
  | { kind: "permission"; text: string; resolve: (v: PermissionAnswer) => void }
  | { kind: "ask"; text: string; resolve: (v: string | undefined) => void }
  | { kind: "select"; title: string; options: { name: string; description: string; value: string }[]; resolve: (v: string | undefined) => void }

export class TuiController {
  readonly out: TuiOutput
  readonly runtime: Runtime
  session: Session
  readonly status: Accessor<StatusInfo>
  readonly setStatus: Setter<StatusInfo>
  readonly modal: Accessor<TuiModal | null>
  readonly setModal: Setter<TuiModal | null>
  readonly modalValue: Accessor<string>
  readonly setModalValue: Setter<string>
  readonly busy: Accessor<boolean>
  private setBusy: Setter<boolean>
  private history: string[] = []
  private hIndex = -1
  private abortCtrl: AbortController | null = null
  authStep: "none" | "select" | "key" = "none"
  private authTargets: import("../cli/auth").LoginTarget[] = []
  private authTarget: import("../cli/auth").LoginTarget | null = null
  onExit: (() => void) | null = null
  clipboard: ((text: string) => boolean) | null = null

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
    const [modalValue, setModalValue] = createSignal("")
    this.modalValue = modalValue
    this.setModalValue = setModalValue
    const [busy, setBusy] = createSignal(false)
    this.busy = busy
    this.setBusy = setBusy
  }

  /** 设置 modal 并清空其文本输入值 */
  showModal(m: TuiModal | null): void {
    this.setModalValue("")
    this.setModal(m)
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

    // auth 向导：输入走向导而非聊天
    if (this.authStep !== "none") {
      await this.handleAuthInput(text)
      return
    }

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
      this.showModal({ kind: "ask", text: question, resolve })
    })
  }

  selectFromList(title: string, options: { name: string; description: string; value: string }[]): Promise<string | undefined> {
    if (this.modal()) return Promise.resolve(undefined)
    return new Promise<string | undefined>((resolve) => {
      this.showModal({ kind: "select", title, options, resolve })
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
    if (this.authStep !== "none") return
    const { loginTargets } = await import("../cli/auth")
    const { hasApiKey } = await import("../config/credentials")
    this.authTargets = loginTargets(this.runtime.config)
    this.out.push({ type: "system", text: "选择要连接的 provider（输入编号，或直接输入 provider 名）:" })
    this.authTargets.forEach((t, i) => {
      const connected = hasApiKey(t.id) || (t.apiKeyEnv ? Boolean(process.env[t.apiKeyEnv]) : false)
      this.out.push({ type: "system", text: `  ${String(i + 1).padStart(2)}. ${t.id}${connected ? " ✓" : ""}` })
    })
    this.authStep = "select"
  }

  /** 主输入框在 auth 向导中的路由：返回 true 表示已消费输入 */
  async handleAuthInput(text: string): Promise<boolean> {
    if (this.authStep === "select") {
      const idx = Number.parseInt(text, 10)
      let target = this.authTargets[idx - 1]
      if (!target) target = this.authTargets.find((t) => t.id === text.toLowerCase())
      if (!target) {
        this.out.push({ type: "error", text: `无效编号/名称: ${text}。` })
        return true
      }
      this.authTarget = target
      this.authStep = "key"
      this.out.push({ type: "system", text: `输入 ${target.id} 的 API key（粘贴或输入后 Enter）:` })
      return true
    }
    if (this.authStep === "key" && this.authTarget) {
      const apiKey = text
      if (!apiKey) {
        this.out.push({ type: "system", text: "已取消连接" })
      } else {
        const { setCredential } = await import("../config/credentials")
        setCredential(this.authTarget.id, { apiKey })
        const connectedText = `✓ 已连接 ${this.authTarget.id}（key: ${maskKey(apiKey)}）`
        this.out.push({ type: "system", text: connectedText })
        // @opentui/solid 的 parts 渲染不可靠，stderr 兜底确保反馈可见
        process.stderr.write(`\n${connectedText}\n`)
        if (!this.runtime.config.model && this.authTarget.defaultModel) {
          const { setOverride } = await import("../config/overrides")
          await setOverride("model", this.authTarget.defaultModel)
          this.runtime.config.model = this.authTarget.defaultModel
          this.out.push({ type: "system", text: `默认模型已设为 ${this.authTarget.defaultModel}` })
        }
      }
      this.authStep = "none"
      this.authTarget = null
      this.authTargets = []
      return true
    }
    return false
  }  resolveModal(value: unknown): void {
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

  lastAssistantText(): string {
    const parts = this.out.parts()
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!
      if (p.type === "text") return p.text
      if (p.type === "assistant") return p.text
    }
    return ""
  }

  copy(text: string): string {
    if (!text) return "没有可复制的内容。"
    if (this.clipboard && this.clipboard(text)) {
      return `已复制 ${text.length} 字符到剪贴板。`
    }
    return "终端不支持 OSC52 剪贴板复制。"
  }

  copySelection(): string {
    return this.copy(this.lastAssistantText())
  }

  switchWorkspace(cwd: string): string {
    if (this.session.messages().length > 0) {
      return "当前会话非空，无法切换工作区（仅空会话可改）。\n可用 `xuanjian workspace <path>` 设置新会话默认工作区，或用 /session resume 恢复其他工作区的会话。"
    }
    this.session.setCwd(cwd)
    this.runtime.config.workspace = cwd
    void setOverride("workspace", cwd)
    this.runtime.lsp.shutdown()
    this.runtime.lsp = new LSPManager(this.runtime.config, cwd)
    this.refreshStatus()
    return `已切换工作区: ${cwd}`
  }

  resumeSession(id: string): boolean {
    const loaded = this.runtime.sessions.load(id)
    if (!loaded) return false
    this.session = loaded
    this.history = []
    this.hIndex = -1
    this.refreshStatus()
    return true
  }

  deleteSession(id: string): boolean {
    return this.runtime.sessions.delete(id)
  }

  listSessionsText(): string {
    const groups = this.runtime.sessions.listByWorkspace()
    if (groups.length === 0) return "暂无会话。"
    const lines: string[] = []
    for (const group of groups) {
      lines.push(`[工作区] ${group.cwd}`)
      for (const s of group.sessions) {
        const title = s.title ? ` "${s.title}"` : ""
        const mark = s.id === this.session.id ? " ★" : ""
        lines.push(`  ${s.id}${title}  ${s.model ?? "?"}  ${s.messageCount} 条消息  ${new Date(s.updatedAt).toLocaleString()}${mark}`)
      }
      lines.push("")
    }
    return lines.join("\n").trimEnd()
  }
}

function maskKey(key: string): string {
  if (key.length <= 6) return "*".repeat(key.length)
  return `${key.slice(0, 3)}${"*".repeat(Math.min(key.length - 6, 6))}${key.slice(-3)}`
}
