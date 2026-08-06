import { logo, banner, goLogo } from "../../cli/banner"

export function uiLogo(): string {
  return logo()
}

export function uiBanner(): string {
  return banner()
}

export function notify(level: "info" | "warn" | "error", message: string): void {
  const colors: Record<string, string> = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" }
  process.stdout.write(`${colors[level] ?? ""}[玄鉴] ${message}\x1b[0m\n`)
}

export const luaUi = { logo: uiLogo, banner: uiBanner, notify, go: goLogo }
