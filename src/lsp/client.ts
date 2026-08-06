import { spawn, type ChildProcess } from "node:child_process"

export interface LSPMessage {
  jsonrpc: string
  method?: string
  id?: number | string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const EMPTY_INITIALIZATION_OPTIONS: Record<string, unknown> = {}

export class LSPClient {
  readonly process: ChildProcess
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private listeners = new Map<string, Set<(params: unknown) => void>>()
  private exitHandlers = new Set<(code: number | null, signal: NodeJS.Signals | null) => void>()
  private buffer = ""
  private closed = false

  private constructor(proc: ChildProcess, initialization?: Record<string, unknown>) {
    this.process = proc
    proc.stdout?.setEncoding("utf8")
    proc.stdout?.on("data", (chunk: string) => this.onData(chunk))
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (process.env.XUANJIAN_LOG === "debug") process.stderr.write(`[lsp stderr] ${chunk.toString()}`)
    })
    proc.on("exit", (code, signal) => {
      this.closed = true
      for (const [, entry] of this.pending) entry.reject(new Error(`LSP 进程退出 (code=${code})`))
      this.pending.clear()
      for (const handler of this.exitHandlers) handler(code, signal)
    })
    proc.on("error", () => {
      this.closed = true
    })
    void this.initialize(initialization)
  }

  static spawn(command: string, args: string[], cwd: string, initialization?: Record<string, unknown>): LSPClient {
    const proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] })
    return new LSPClient(proc, initialization)
  }

  onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    this.exitHandlers.add(handler)
  }

  onNotification(method: string, handler: (params: unknown) => void): () => void {
    const set = this.listeners.get(method) ?? new Set()
    set.add(handler)
    this.listeners.set(method, set)
    return () => set.delete(handler)
  }

  send(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("LSP 客户端已关闭"))
    const id = this.nextId++
    const message: LSPMessage = { jsonrpc: "2.0", id, method, params }
    this.write(message)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return
    this.write({ jsonrpc: "2.0", method, params })
  }

  shutdown(): Promise<void> {
    if (this.closed) return Promise.resolve()
    return this.send("shutdown").catch(() => undefined).then(() => {
      this.notify("exit")
      this.process.kill("SIGTERM")
    })
  }

  isClosed(): boolean {
    return this.closed
  }

  private write(message: LSPMessage): void {
    const payload = JSON.stringify(message)
    const header = `Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n`
    this.process.stdin?.write(header + payload)
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n")
      if (headerEnd === -1) return
      const header = this.buffer.slice(0, headerEnd)
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const bodyStart = headerEnd + 4
      if (this.buffer.length < bodyStart + length) return
      const body = this.buffer.slice(bodyStart, bodyStart + length)
      this.buffer = this.buffer.slice(bodyStart + length)
      this.dispatch(JSON.parse(body))
    }
  }

  private dispatch(message: LSPMessage): void {
    if (typeof message.id === "number" && message.method === undefined) {
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      if (message.error) entry.reject(new Error(`LSP error: ${message.error.message}`))
      else entry.resolve(message.result)
      return
    }
    if (message.method) {
      const set = this.listeners.get(message.method)
      if (set) {
        for (const handler of [...set]) {
          try {
            handler(message.params)
          } catch (err) {
            console.error("[lsp] notification handler error:", err)
          }
        }
      }
      return
    }
    // 服务器发起的 request（如 workspace/configuration）：统一以空结果响应
    if (typeof message.id === "number" && message.method) {
      this.write({ jsonrpc: "2.0", id: message.id, result: EMPTY_INITIALIZATION_OPTIONS })
    }
  }

  private async initialize(initialization?: Record<string, unknown>): Promise<void> {
    await this.send("initialize", {
      processId: process.pid,
      clientInfo: { name: "xuanjian", version: "0.1.0" },
      capabilities: {
        textDocument: {
          definition: { linkSupport: false },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          hover: {},
          completion: {},
          formatting: {},
          diagnostic: {},
        },
        workspace: { configuration: false },
      },
      initializationOptions: initialization ?? {},
    })
    this.notify("initialized", {})
  }
}
