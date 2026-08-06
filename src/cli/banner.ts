const WORDMARK = [
  " __  __                  _ _             ",
  " \\ \\/ /   _  __ _ _ __  (_|_) __ _ _ __  ",
  "  \\  / | | |/ _` | '_ \\ | | |/ _` | '_ \\ ",
  "  /  \\ |_| | (_| | | | || | | (_| | | | |",
  " /_/\\_\\__,_|\\__,_|_| |_|/ |_|\\__,_|_| |_|",
  "                      |__/               ",
]

const GO_LOGO = {
  left: ["    ", "█  █", " ██ ", " ██ ", "█  █"],
  right: ["    ", "▄▄▄█", "   █", "█  █", " ▀▀ "],
}

const MIN_WIDTH = 50
const MIN_HEIGHT = 12

const RESET = "\x1b[0m"
const LEFT = { fg: "\x1b[90m", shadow: "\x1b[38;5;235m", bg: "\x1b[48;5;235m" }
const RIGHT = { fg: RESET, shadow: "\x1b[38;5;238m", bg: "\x1b[48;5;238m" }

function isTTY(): boolean {
  return Boolean(process.stdout.isTTY && process.stderr.isTTY)
}

function terminalSize(): { width: number; height: number } {
  const width = process.stdout.columns ?? 80
  const height = process.stdout.rows ?? 24
  return { width, height }
}

function draw(line: string, fg: string, shadow: string, bg: string): string {
  const parts: string[] = []
  for (const char of line) {
    if (char === "_") {
      parts.push(bg, " ", RESET)
      continue
    }
    if (char === "^") {
      parts.push(fg, bg, "▀", RESET)
      continue
    }
    if (char === "~") {
      parts.push(shadow, "▀", RESET)
      continue
    }
    if (char === " ") {
      parts.push(" ")
      continue
    }
    parts.push(fg, char, RESET)
  }
  return parts.join("")
}

function renderColored(pad?: string): string {
  const { width, height } = terminalSize()
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return (pad ?? "") + "\x1b[1mXuanjian (玄鉴)\x1b[0m"
  }
  const lines: string[] = []
  for (const row of WORDMARK) {
    lines.push((pad ?? "") + draw(row, LEFT.fg, LEFT.shadow, LEFT.bg))
  }
  return lines.join("\n")
}

function renderPlain(pad?: string): string {
  const lines: string[] = []
  for (const row of WORDMARK) {
    lines.push((pad ?? "") + row.trimEnd())
  }
  return lines.join("\n").trimEnd()
}

export function logo(pad?: string): string {
  if (!isTTY()) return renderPlain(pad)
  return renderColored(pad)
}

export function banner(): string {
  const { width, height } = terminalSize()
  const compact = width < MIN_WIDTH || height < MIN_HEIGHT
  const title = compact ? "" : "\n\x1b[1m玄鉴 Xuanjian\x1b[0m — 深察明镜，审鉴万物"
  return logo() + title
}

export function goLogo(): string {
  const rows: string[] = []
  for (let i = 0; i < GO_LOGO.left.length; i++) {
    const left = GO_LOGO.left[i] ?? ""
    const right = GO_LOGO.right[i] ?? ""
    if (isTTY()) {
      rows.push(draw(left, LEFT.fg, LEFT.shadow, LEFT.bg) + " " + draw(right, RIGHT.fg, RIGHT.shadow, RIGHT.bg))
    } else {
      rows.push((left + " " + right).trimEnd())
    }
  }
  return rows.join("\n")
}

// —— TUI 专用：无 ANSI 的 banner 结构，由 opentui 组件分栏渲染 ——

/** XUANJIAN 书法字标的左右分栏（左侧为装饰笔画，右侧为主字形） */
const SPLIT_COL = 22

export function logoColumns(): { leading: string[]; main: string[] } {
  const leading: string[] = []
  const main: string[] = []
  for (const row of WORDMARK) {
    leading.push(row.slice(0, SPLIT_COL))
    main.push(row.slice(SPLIT_COL).trimEnd())
  }
  return { leading, main }
}

export function bannerTitle(): string {
  return "玄鉴 Xuanjian — 深察明镜，审鉴万物"
}
