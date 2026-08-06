import type { JSONSchema7 } from "../llm/schema-json"

export interface ToolContext {
  cwd: string
  sessionID?: string
  abort?: AbortSignal
  extra?: Record<string, unknown>
}

export interface ExecuteResult {
  title: string
  output: string
  metadata?: Record<string, unknown>
}

export interface ToolDef {
  id: string
  description: string
  parameters?: JSONSchema7
  call(ctx: ToolContext, args: Record<string, unknown>): Promise<ExecuteResult>
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>()

  register(def: ToolDef): void {
    if (this.tools.has(def.id)) throw new Error(`工具 ${def.id} 已存在`)
    this.tools.set(def.id, def)
  }

  registerOrReplace(def: ToolDef): void {
    this.tools.set(def.id, def)
  }

  unregister(id: string): void {
    this.tools.delete(id)
  }

  get(id: string): ToolDef | undefined {
    return this.tools.get(id)
  }

  list(): ToolDef[] {
    return Array.from(this.tools.values())
  }

  clear(): void {
    this.tools.clear()
  }
}
