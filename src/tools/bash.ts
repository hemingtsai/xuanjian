import path from "node:path"
import fs from "node:fs"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

const BashArgs = z.object({
  command: z.string().describe("要执行的 shell 命令"),
  timeout_ms: z.number().int().positive().optional().describe("超时（毫秒），默认 120000"),
  cwd: z.string().optional().describe("工作目录，默认项目根"),
  input: z.string().optional().describe("标准输入内容"),
})

const MAX_OUTPUT = 64 * 1024

/** 解析 shell 绝对路径：TUI 环境下 PATH 可能不完整，直接用 SHELL 或 /bin/bash 避免 posix_spawn ENOENT */
function resolveShell(): string {
  const shell = process.env.SHELL
  if (shell && path.isAbsolute(shell)) {
    try {
      fs.accessSync(shell)
      return shell
    } catch {
      // 不存在则回退
    }
  }
  return process.platform === "win32" ? "cmd.exe" : "/bin/bash"
}

export const BashTool: ToolDef = {
  id: "bash",
  description: "执行 shell 命令。适合构建、测试、git 操作等。输出截断至 64KB。",
  parameters: zodToJsonSchema(BashArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(BashArgs, rawArgs)
    const timeout = args.timeout_ms ?? 120_000
    const cwd = args.cwd ? (path.isAbsolute(args.cwd) ? args.cwd : path.resolve(ctx.cwd, args.cwd)) : ctx.cwd

    const shell = resolveShell()
    const proc = Bun.spawn([shell, "-c", args.command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: args.input !== undefined ? "pipe" : "ignore",
      signal: ctx.abort,
    })
    if (args.input !== undefined) {
      proc.stdin?.write(args.input)
      proc.stdin?.end()
    }

    const timer = setTimeout(() => proc.kill(), timeout)
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    clearTimeout(timer)
    const code = await proc.exited

    const trim = (s: string) => (s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + `\n...(截断, 共 ${s.length} 字符)` : s)
    const out = trim(stdout)
    const err = trim(stderr)
    const parts: string[] = []
    if (out) parts.push(out)
    if (err) parts.push(err ? `[stderr]\n${err}` : "")
    return { title: `bash: ${args.command.slice(0, 60)}`, output: parts.filter(Boolean).join("\n") + `\n[exit code: ${code}]`, metadata: { code } }
  },
}
