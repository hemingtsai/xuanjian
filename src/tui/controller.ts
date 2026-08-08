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
import { runReview, fixTasksFromReview } from "../review/pipeline"
import type { TodoItem, ReviewFeedEntry } from "../core/todo-store"

export type PanelTab = "todos" | "review"

export class TuiController {
  readonly out: TuiOutput
  readonly runtime: Runtime
  session: Session
  readonly status: Accessor<StatusInfo>
  readonly setStatus: Setter<StatusInfo>
  readonly panelTab: Accessor<PanelTab>
  private setPanelTab: Setter<PanelTab>
  readonly todosItems: Accessor<TodoItem[]>
  readonly todosReviews: Accessor<ReviewFeedEntry[]>
  readonly busy: Accessor<boolean>
  private setBusy: Setter<boolean>
  private history: string[] = []
  private hIndex = -1
  private abortCtrl: AbortController | null = null
  authStep: "none" | "select" | "key" = "none"
  private authTargets: import("../cli/auth").LoginTarget[] = []
  private authTarget: import("../cli/auth").LoginTarget | null = null
  private pendingPermission: { req: PermissionRequest; resolve: (v: PermissionAnswer | undefined) => void } | null = null
  private pendingAsk: { question: string; resolve: (v: string | undefined) => void } | null = null
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
    const [panelTab, setPanelTab] = createSignal<PanelTab>("todos")
    this.panelTab = panelTab
    this.setPanelTab = setPanelTab
    // TodoStore（core，纯 TS）桥接到 Solid signal 供右侧面板响应式渲染
    const [todosItems, setTodosItems] = createSignal<TodoItem[]>(runtime.todos.items())
    const [todosReviews, setTodosReviews] = createSignal<ReviewFeedEntry[]>(runtime.todos.reviews())
    runtime.todos.subscribe(() => {
      setTodosItems(runtime.todos.items())
      setTodosReviews(runtime.todos.reviews())
    })
    this.todosItems = todosItems
    this.todosReviews = todosReviews
    const [busy, setBusy] = createSignal(false)
    this.busy = busy
    this.setBusy = setBusy
  }

  /** 右侧面板选项卡切换（Ctrl-T） */
  cyclePanelTab(): void {
    this.setPanelTab((t) => (t === "todos" ? "review" : "todos"))
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
    if (!text) return

    // 权限应答：agent 等待权限期间（busy）也必须响应
    if (this.pendingPermission) {
      const p = this.pendingPermission
      this.pendingPermission = null
      const a = text.toLowerCase()
      const label = a === "y" ? "已允许" : a === "n" ? "已拒绝" : a === "a" ? "本次会话允许" : a === "s" ? "总是允许" : "已拒绝"
      p.resolve(a === "y" ? "allow" : a === "n" ? "deny" : a === "a" ? "session" : a === "s" ? "always" : "deny")
      this.out.push({ type: "system", text: `→ ${label}` })
      return
    }

    // 提问应答
    if (this.pendingAsk) {
      const p = this.pendingAsk
      this.pendingAsk = null
      p.resolve(text || undefined)
      this.out.push({ type: "system", text: `→ ${text}` })
      return
    }

    // auth 向导：输入走向导而非聊天
    if (this.authStep !== "none") {
      await this.handleAuthInput(text)
      return
    }

    if (this.busy()) return

    this.pushHistory(text)
    this.out.push({ type: "user", text })
    if (text.startsWith("/")) {
      await this.handleSlash(text)
      this.refreshStatus()
      return
    }
    // 用户每条信息先转为待办（当前进行中），回合结束后标记完成
    const todo = this.runtime.todos.addTask(text)
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
        todos: runtime.todos,
        sink: createTuiSink(this.out),
        askPermission: (req) => this.askPermission(req),
        askUser: (q) => this.askUser(q),
        abort: this.abortCtrl.signal,
      })
      this.runtime.todos.patchStatus(todo.id, "done")
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
    if (this.pendingPermission) return Promise.resolve(undefined)
    const subject = toolSubject(req.tool, req.args)
    this.out.push({ type: "system", text: `[权限] 请求权限: ${req.tool}${subject ? ` ${subject}` : ""}（输入 y=允许 n=拒绝 a=会话 s=总是）` })
    return new Promise<PermissionAnswer | undefined>((resolve) => {
      this.pendingPermission = { req, resolve }
    })
  }

  askUser(question: string): Promise<string | undefined> {
    if (this.pendingAsk) return Promise.resolve(undefined)
    this.out.push({ type: "system", text: `[提问] ${question}（输入回答后 Enter）` })
    return new Promise<string | undefined>((resolve) => {
      this.pendingAsk = { question, resolve }
    })
  }

  /** 运行审查流水线：报告进入审查面板，发现问题则把修正任务插入到当前待办之后 */
  async runReview(todo: string): Promise<string> {
    const model = this.session.model ?? this.runtime.config.model
    if (!model) return "未配置模型。"
    this.out.push({ type: "system", text: "运行玄鉴审查流水线..." })
    const output = await runReview({ todo, cwd: this.session.cwd, config: this.runtime.config, model, noAutoCommit: false })
    const report = output.report || "无变更或无匹配审查员。"
    this.runtime.todos.addReview("review", report)
    const fixes = fixTasksFromReview(output.results)
    if (fixes.length > 0) {
      const n = this.runtime.todos.insertFixTasks(fixes)
      this.out.push({ type: "system", text: `审查发现 ${fixes.length} 个问题，已插入 ${n} 个修正任务到当前待办之后。` })
    }
    return report
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
        this.out.push({ type: "system", text: `✓ 已连接 ${this.authTarget.id}（key: ${maskKey(apiKey)}）` })
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
