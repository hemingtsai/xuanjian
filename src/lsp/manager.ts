import path from "node:path"
import { LSPClient } from "./client"
import { serverFor, DEFAULT_SERVERS as DEFAULT_SERVER_LANGS } from "./servers"
import type { Config } from "../config/schema"
import { emit } from "../core/events"

export const LSP_ROOT = Symbol("LSP_ROOT")

export interface LSPDiagnostic {
  source?: string
  code?: string | number
  severity?: number
  message: string
  range: { start: { line: number; character: number }; end: { line: number; character: number } }
}

const LANG_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".lua": "lua",
  ".json": "json",
  ".jsonc": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".mdx": "markdown",
}

export function detectLanguage(file: string): string | undefined {
  return LANG_BY_EXT[path.extname(file).toLowerCase()]
}

export function pathToURI(file: string): string {
  const abs = path.resolve(file)
  return `file://${abs.split(path.sep).map((seg) => encodeURIComponent(seg)).join("/")}`
}

interface ClientEntry {
  client: LSPClient
  language: string
  failures: number
}

export class LSPManager {
  private config: Config
  private cwd: string
  private clients = new Map<string, ClientEntry>()
  private openDocs = new Map<string, string>() // uri -> language
  private shuttered = new Set<string>()
  private diagnostics = new Map<string, LSPDiagnostic[]>()

  constructor(config: Config, cwd: string) {
    this.config = config
    this.cwd = cwd
  }

  getDiagnostics(uri: string): LSPDiagnostic[] {
    return this.diagnostics.get(uri) ?? []
  }

  debugInfo(): {
    languages: { language: string; server: import("./servers").ServerConfig | undefined; running: boolean; shuttered: boolean }[]
  } {
    const languages = Object.keys(DEFAULT_SERVER_LANGS)
    return {
      languages: languages.map((language) => ({
        language,
        server: serverFor(language, this.config.lsp),
        running: Boolean(this.clients.get(language)),
        shuttered: this.shuttered.has(language),
      })),
    }
  }

  private subscribeDiagnostics(client: LSPClient): void {
    client.onNotification("textDocument/publishDiagnostics", (params) => {
      const p = params as { uri?: string; diagnostics?: LSPDiagnostic[] }
      if (!p.uri) return
      this.diagnostics.set(p.uri, p.diagnostics ?? [])
      void emit("lsp.diagnostic", { file: p.uri, diagnostics: p.diagnostics ?? [] })
    })
  }

  /** 确保给定文件的服务器已就绪，返回 client；无服务器或连续失败则 undefined */
  async ensure(file: string): Promise<LSPClient | undefined> {
    const language = detectLanguage(file)
    if (!language) return undefined
    const uri = pathToURI(file)
    const existing = this.clients.get(language)
    if (existing && !existing.client.isClosed()) {
      await this.ensureOpen(existing.client, language, uri)
      return existing.client
    }
    if (this.shuttered.has(language)) return undefined

    const server = serverFor(language, this.config.lsp)
    if (!server) return undefined

    let client: LSPClient
    try {
      client = LSPClient.spawn(server.command, server.args, this.cwd, server.initializationOptions)
    } catch {
      this.shuttered.add(language)
      return undefined
    }

    const entry: ClientEntry = { client, language, failures: 0 }
    client.onExit(() => {
      if (this.clients.get(language) === entry) {
        entry.failures += 1
        if (entry.failures >= 3) this.shuttered.add(language)
        else this.clients.delete(language)
      }
    })
    this.clients.set(language, entry)
    this.subscribeDiagnostics(client)
    await this.ensureOpen(client, language, uri)
    return client
  }

  private async ensureOpen(client: LSPClient, language: string, uri: string): Promise<void> {
    if (this.openDocs.has(uri)) return
    let text = ""
    try {
      const fs = await import("node:fs")
      text = fs.readFileSync(uri.replace(/^file:\/\//, ""), "utf8")
    } catch {
      text = ""
    }
    this.openDocs.set(uri, language)
    client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId: language, version: 1, text },
    })
  }

  async didChange(uri: string, text: string): Promise<void> {
    const language = this.openDocs.get(uri)
    if (!language) return
    const entry = this.clients.get(language)
    if (!entry || entry.client.isClosed()) return
    const version = (this.versions.get(uri) ?? 1) + 1
    this.versions.set(uri, version)
    entry.client.notify("textDocument/didChange", {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    })
  }

  private versions = new Map<string, number>()

  async didSave(uri: string): Promise<void> {
    const language = this.openDocs.get(uri)
    if (!language) return
    const entry = this.clients.get(language)
    if (!entry || entry.client.isClosed()) return
    entry.client.notify("textDocument/didSave", { textDocument: { uri } })
  }

  shutdown(): void {
    for (const { client } of this.clients.values()) {
      void client.shutdown()
    }
    this.clients.clear()
    this.openDocs.clear()
  }
}
