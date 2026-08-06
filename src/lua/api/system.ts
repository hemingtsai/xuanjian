import path from "node:path"
import { getLuaContext } from "./context"

export interface LuaRunResult {
  stdout: string
  stderr: string
  code: number
}

const MAX_OUTPUT = 64 * 1024

export function run(command: string | string[], opts?: { cwd?: string; env?: Record<string, string>; timeout_ms?: number; input?: string }): Promise<LuaRunResult> {
  const ctx = getLuaContext()
  const base = ctx?.cwd ?? process.cwd()
  const cwd = opts?.cwd ? (path.isAbsolute(opts.cwd) ? opts.cwd : path.resolve(base, opts.cwd)) : base
  const timeout = opts?.timeout_ms ?? 120_000

  const argv = typeof command === "string" ? ["bash", "-c", command] : command

  return new Promise((resolve, reject) => {
    const proc = Bun.spawn(argv, { cwd, env: opts?.env, stdin: opts?.input !== undefined ? "pipe" : "ignore", stdout: "pipe", stderr: "pipe" })
    if (opts?.input !== undefined) {
      proc.stdin?.write(opts.input)
      proc.stdin?.end()
    }
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeout)
    Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
      .then(async ([stdout, stderr]) => {
        clearTimeout(timer)
        const code = await proc.exited
        resolve({
          stdout: truncate(stdout),
          stderr: truncate(stderr),
          code,
        })
      })
      .catch(reject)
  })
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `...(截断 ${s.length})` : s
}

export const luaSystem = { run }
