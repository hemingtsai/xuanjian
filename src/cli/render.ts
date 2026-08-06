import type { LoopSink } from "../core/agent-loop"

const CYAN = "\x1b[36m"
const DIM = "\x1b[90m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"

export class StreamRenderer implements LoopSink {
  private model: string
  private lineBuf = ""

  constructor(model: string) {
    this.model = model
  }

  text(chunk: string): void {
    process.stdout.write(chunk)
    this.lineBuf += chunk
  }

  reasoning(chunk: string): void {
    if (process.stdout.isTTY) {
      process.stdout.write(`${DIM}${chunk}${RESET}`)
    }
  }

  toolStart(tool: string, args: Record<string, unknown>): void {
    this.flushLine()
    const preview = safePreview(args)
    process.stdout.write(`\n${CYAN}⚙ ${tool}${RESET}${preview}\n`)
  }

  toolEnd(tool: string, result: { title: string; output: string }): void {
    const out = result.output.split("\n").filter(Boolean).slice(0, 8).join("\n")
    const truncated = result.output.split("\n").length > 8 ? `\n${DIM}...(输出已截断)${RESET}` : ""
    process.stdout.write(`${GREEN}✓ ${result.title}${RESET}\n${DIM}${out}${RESET}${truncated}\n\n`)
  }

  error(message: string): void {
    this.flushLine()
    process.stdout.write(`${RED}✗ ${message}${RESET}\n`)
  }

  done(text: string): void {
    this.flushLine()
  }

  private flushLine(): void {
    if (this.lineBuf.length > 0 && !this.lineBuf.endsWith("\n")) {
      process.stdout.write("\n")
    }
    this.lineBuf = ""
  }
}

export function quietRenderer(): LoopSink {
  return {
    text() {},
    reasoning() {},
    toolStart() {},
    toolEnd() {},
    error() {},
    done() {},
  }
}

function safePreview(args: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(args)
    if (json.length <= 160) return json === "{}" ? "" : ` ${DIM}${json}${RESET}`
    return ` ${DIM}${json.slice(0, 157)}...${RESET}`
  } catch {
    return ""
  }
}

export function statusLine(model: string): string {
  return `${BOLD}模型${RESET} ${CYAN}${model}${RESET}`
}
