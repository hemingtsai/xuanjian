import { randomUUID } from "node:crypto"
import type { Store, SessionRecord, MessageRecord } from "../storage/db"

let idCounter = 0
export function newID(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}${idCounter}`
}

export function newUUID(): string {
  return randomUUID()
}

export class Session {
  readonly id: string
  readonly store: Store
  private data: SessionRecord

  constructor(store: Store, data: SessionRecord) {
    this.store = store
    this.id = data.id
    this.data = data
  }

  get cwd(): string {
    return this.data.cwd
  }
  get model(): string | undefined {
    return this.data.model
  }
  get agent(): string | undefined {
    return this.data.agent
  }
  get title(): string | undefined {
    return this.data.title
  }
  get record(): SessionRecord {
    return { ...this.data }
  }

  setModel(model: string): void {
    this.data.model = model
    this.store.updateSession(this.id, { model })
  }

  setAgent(agent: string): void {
    this.data.agent = agent
    this.store.updateSession(this.id, { agent })
  }

  setTitle(title: string): void {
    this.data.title = title
    this.store.updateSession(this.id, { title })
  }

  messages(): MessageRecord[] {
    return this.store.listMessages(this.id)
  }

  addMessage(input: {
    role: string
    content: string
    toolCalls?: { id: string; name: string; args: Record<string, unknown> }[]
    toolCallId?: string
  }): MessageRecord {
    const record: MessageRecord = {
      id: newUUID(),
      session_id: this.id,
      role: input.role,
      content: input.content,
      tool_calls: input.toolCalls ? JSON.stringify(input.toolCalls) : undefined,
      tool_call_id: input.toolCallId,
      created_at: Date.now(),
    }
    this.store.addMessage(record)
    this.store.updateSession(this.id, {})
    return record
  }

  toLLMMessages(): import("../llm/llm").LLMMessage[] {
    const messages: import("../llm/llm").LLMMessage[] = []
    for (const m of this.messages()) {
      if (m.role === "tool") {
        messages.push({ role: "tool", content: m.content, toolCallId: m.tool_call_id ?? "" })
        continue
      }
      if (m.role === "user" || m.role === "assistant") {
        const toolCalls = m.tool_calls ? (JSON.parse(m.tool_calls) as { id: string; name: string; args: Record<string, unknown> }[]) : undefined
        messages.push({ role: m.role as "user" | "assistant", content: m.content, toolCalls })
      }
    }
    return messages
  }

  /** 压缩会话：保留最前 keepFirst 条 + 最后 keepLast 条，删除中间消息 */
  compact(keepFirst: number, keepLast: number): number {
    const all = this.messages()
    if (all.length <= keepFirst + keepLast) return 0
    const removed = all.slice(keepFirst, all.length - keepLast)
    this.store.deleteMessages(this.id, removed.map((m) => m.id))
    return removed.length
  }
}

export class SessionManager {
  readonly store: Store

  constructor(store: Store) {
    this.store = store
  }

  create(input: { cwd: string; model?: string; agent?: string; title?: string }): Session {
    const record: SessionRecord = {
      id: newUUID(),
      cwd: input.cwd,
      model: input.model,
      agent: input.agent,
      title: input.title,
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    this.store.createSession(record)
    return new Session(this.store, record)
  }

  load(id: string): Session | undefined {
    const record = this.store.getSession(id)
    return record ? new Session(this.store, record) : undefined
  }

  resumeLatest(): Session | undefined {
    const record = this.store.latestSession()
    return record ? new Session(this.store, record) : undefined
  }
}
