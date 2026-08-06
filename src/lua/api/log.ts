const PREFIX = "\x1b[90m[玄鉴]\x1b[0m"

export function log(level: "trace" | "debug" | "info" | "warn" | "error", message: string, ...rest: unknown[]): void {
  if (level === "debug" || level === "trace") {
    if (process.env.XUANJIAN_LOG !== "debug") return
  }
  const text = rest.length > 0 ? message.replace(/%s/g, () => String(rest.shift())) : message
  process.stderr.write(`${PREFIX} ${level.toUpperCase()} ${text}\n`)
}

export const luaLog = {
  trace: (m: string, ...r: unknown[]) => log("trace", m, ...r),
  debug: (m: string, ...r: unknown[]) => log("debug", m, ...r),
  info: (m: string, ...r: unknown[]) => log("info", m, ...r),
  warn: (m: string, ...r: unknown[]) => log("warn", m, ...r),
  error: (m: string, ...r: unknown[]) => log("error", m, ...r),
}
