import path from "node:path"
import type { Config } from "../config/schema"
import type { LSPManager } from "../lsp/manager"
import { getDapStatus } from "../dap/status"
import { findBuiltin } from "../llm/providers"

export interface StatusInfo {
  model: string
  agent: string
  mode: string
  workspace: string
  lsp: string
  dap: string
  ctx: string
}

export function estimateTokens(chars: number): number {
  return Math.round(chars / 4)
}

export function modelContextWindow(config: Config, modelId: string | undefined): number | undefined {
  if (!modelId) return undefined
  const slash = modelId.indexOf("/")
  if (slash === -1) return undefined
  const providerID = modelId.slice(0, slash)
  const modelID = modelId.slice(slash + 1)
  const user = config.provider[providerID]
  if (user?.models?.[modelID]?.context) return user.models[modelID]!.context
  const builtin = findBuiltin(providerID)
  return builtin?.default_models[modelID]?.context
}

export function lspStatus(manager: LSPManager, max = 3): string {
  const langs = manager.debugInfo().languages.filter((l) => l.server)
  const running = langs.filter((l) => l.running)
  const shuttered = langs.filter((l) => l.shuttered)
  if (running.length === 0 && shuttered.length === 0) return "—"
  const parts: string[] = []
  for (const r of running.slice(0, max)) parts.push(`${r.language}✓`)
  for (const s of shuttered.slice(0, max - running.length)) parts.push(`${s.language}✗`)
  if (langs.length > parts.length) parts.push(`…${langs.length - parts.length}`)
  return parts.join(" ") || "—"
}

export function buildStatus(input: {
  config: Config
  model: string | undefined
  agent: string | undefined
  cwd: string
  lsp: LSPManager
  goalActive: boolean
  chars: number
}): StatusInfo {
  const agent = input.agent ?? input.config.default_agent ?? "build"
  const model = input.model ?? input.config.model ?? "—"
  const tokens = estimateTokens(input.chars)
  const window = modelContextWindow(input.config, input.model ?? input.config.model)
  const ctx = window ? `${formatTokens(tokens)}/${formatTokens(window)} (${Math.min(99, Math.round((tokens / window) * 100))}%)` : `~${formatTokens(tokens)}`
  return {
    model,
    agent,
    mode: agent + (input.goalActive ? " · goal" : ""),
    workspace: path.basename(input.cwd) || input.cwd,
    lsp: lspStatus(input.lsp),
    dap: getDapStatus().state,
    ctx,
  }
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
