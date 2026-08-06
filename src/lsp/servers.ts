import type { LspServerEntry } from "../config/schema"

export interface ServerConfig {
  command: string
  args: string[]
  initializationOptions?: Record<string, unknown>
}

export const DEFAULT_SERVERS: Record<string, ServerConfig> = {
  typescript: { command: "typescript-language-server", args: ["--stdio"] },
  typescriptreact: { command: "typescript-language-server", args: ["--stdio"] },
  javascript: { command: "typescript-language-server", args: ["--stdio"] },
  javascriptreact: { command: "typescript-language-server", args: ["--stdio"] },
  python: { command: "basedpyright-langserver", args: ["--stdio"] },
  go: { command: "gopls", args: [] },
  rust: { command: "rust-analyzer", args: [] },
  lua: { command: "lua-language-server", args: ["--stdio"] },
  json: { command: "vscode-json-languageserver", args: ["--stdio"] },
  yaml: { command: "yaml-language-server", args: ["--stdio"] },
  markdown: { command: "markdown-language-server", args: ["--stdio"] },
}

export function serverFor(language: string, config: Record<string, LspServerEntry>): ServerConfig | undefined {
  const user = config[language]
  if (user?.disabled) return undefined
  const defaults = DEFAULT_SERVERS[language]
  if (!user && !defaults) return undefined
  return {
    command: user?.command ?? defaults!.command,
    args: user?.args ?? defaults!.args,
    initializationOptions: user?.initializationOptions,
  }
}
