import { createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import type { LoopSink } from "../core/agent-loop"
import type { ExecuteResult } from "../tools/registry"

export type OutputPart =
  | { type: "user"; text: string }
  | { type: "assistant"; text: string }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; tool: string; args: string }
  | { type: "tool-result"; tool: string; title: string; output: string; diff?: string; content?: string }
  | { type: "error"; text: string }
  | { type: "system"; text: string }

export class TuiOutput {
  parts: Accessor<OutputPart[]>
  setParts: Setter<OutputPart[]>
  private streamOpen = false

  constructor() {
    const [parts, setParts] = createSignal<OutputPart[]>([])
    this.parts = parts
    this.setParts = setParts
  }

  push(part: OutputPart): void {
    this.setParts((p) => [...p, part])
  }

  streamText(chunk: string): void {
    if (this.streamOpen) {
      this.setParts((p) => {
        const last = p[p.length - 1]
        if (last?.type === "text") return [...p.slice(0, -1), { type: "text", text: last.text + chunk }]
        return [...p, { type: "text", text: chunk }]
      })
      return
    }
    this.streamOpen = true
    this.push({ type: "text", text: chunk })
  }

  closeStream(): void {
    this.streamOpen = false
  }

  clear(): void {
    this.setParts([])
    this.streamOpen = false
  }
}

function previewArgs(args: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(args)
    if (json.length <= 100) return json
    return json.slice(0, 97) + "..."
  } catch {
    return ""
  }
}

export function createTuiSink(out: TuiOutput): LoopSink {
  return {
    text(chunk) {
      out.streamText(chunk)
    },
    reasoning(chunk) {
      out.push({ type: "reasoning", text: chunk })
    },
    toolStart(tool, args) {
      out.closeStream()
      out.push({ type: "tool", tool, args: previewArgs(args) })
    },
    toolEnd(tool, result) {
      out.push(toToolResult(tool, result))
    },
    error(message) {
      out.closeStream()
      out.push({ type: "error", text: message })
    },
    done() {
      out.closeStream()
    },
  }
}

function toToolResult(tool: string, result: { title: string; output: string; metadata?: ExecuteResult["metadata"] }): OutputPart {
  const diff = typeof result.metadata?.diff === "string" ? (result.metadata.diff as string) : undefined
  const content = typeof result.metadata?.content === "string" ? (result.metadata.content as string) : undefined
  return { type: "tool-result", tool, title: result.title, output: result.output, diff, content }
}
