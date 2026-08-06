import type { PermissionConfig } from "../config/schema"

export type PermissionMode = "ask" | "allow" | "deny"

export interface PermissionRequest {
  tool: string
  args: Record<string, unknown>
  sessionID?: string
}

export interface PermissionOutcome {
  decision: "allow" | "deny" | "ask"
  matchedRule?: string
  mode: PermissionMode
}

export function toolSubject(tool: string, args: Record<string, unknown>): string {
  if (tool === "bash") {
    const cmd = args.command
    if (typeof cmd === "string") return cmd.trim()
  }
  const file = args.file_path ?? args.path
  if (typeof file === "string") return file
  try {
    return JSON.stringify(args)
  } catch {
    return ""
  }
}

function matchesRule(tool: string, subject: string, rule: string): boolean {
  const colon = rule.indexOf(":")
  if (colon === -1) return rule === tool
  const ruleTool = rule.slice(0, colon)
  const ruleSub = rule.slice(colon + 1)
  if (ruleTool !== tool) return false
  if (ruleSub.length === 0) return true
  return subject.startsWith(ruleSub)
}

export class PermissionEngine {
  private config: PermissionConfig
  private sessionAllow: Set<string>
  private defaultOverride?: PermissionMode

  constructor(config: PermissionConfig, opts?: { defaultOverride?: PermissionMode }) {
    this.config = config
    this.sessionAllow = new Set()
    this.defaultOverride = opts?.defaultOverride
  }

  setDefaultOverride(mode: PermissionMode | undefined): void {
    this.defaultOverride = mode
  }

  /** 本次会话内始终允许某个规则（REPL 的 'a' 键） */
  allowForSession(rule: string): void {
    this.sessionAllow.add(rule)
  }

  setConfig(config: PermissionConfig): void {
    this.config = config
  }

  decide(req: PermissionRequest): PermissionOutcome {
    const subject = toolSubject(req.tool, req.args)
    for (const rule of this.config.deny ?? []) {
      if (matchesRule(req.tool, subject, rule)) return { decision: "deny", matchedRule: rule, mode: "deny" }
    }
    for (const rule of this.sessionAllow) {
      if (matchesRule(req.tool, subject, rule)) return { decision: "allow", matchedRule: rule, mode: "allow" }
    }
    for (const rule of this.config.allow ?? []) {
      if (matchesRule(req.tool, subject, rule)) return { decision: "allow", matchedRule: rule, mode: "allow" }
    }
    const mode = this.defaultOverride ?? this.config.default ?? "ask"
    if (mode === "deny") return { decision: "deny", mode }
    if (mode === "allow") return { decision: "allow", mode }
    return { decision: "ask", mode }
  }
}
