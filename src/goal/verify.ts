import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export interface VerifyResult {
  name: string
  passed: boolean
  output: string
}

function run(cwd: string, command: string, args: string[], timeout = 120_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()))
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()))
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeout)
    proc.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
    proc.on("error", (err) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout: "", stderr: err.message })
    })
  })
}

function packageScript(cwd: string, name: string): string | undefined {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"))
    const script = pkg.scripts?.[name]
    return typeof script === "string" ? script : undefined
  } catch {
    return undefined
  }
}

export async function runVerification(cwd: string, items: string[]): Promise<VerifyResult[]> {
  const results: VerifyResult[] = []
  for (const item of items) {
    if (item === "test") {
      const script = packageScript(cwd, "test")
      if (!script) {
        results.push({ name: "test", passed: true, output: "无 test 脚本，跳过" })
        continue
      }
      const r = await run(cwd, "bash", ["-c", script])
      results.push({ name: "test", passed: r.code === 0, output: truncate(r.stdout || r.stderr) })
    } else if (item === "typecheck") {
      if (fs.existsSync(path.join(cwd, "tsconfig.json"))) {
        const r = await run(cwd, "bunx", ["tsc", "--noEmit"])
        results.push({ name: "typecheck", passed: r.code === 0, output: truncate(r.stdout || r.stderr) })
      } else {
        const script = packageScript(cwd, "typecheck")
        if (script) {
          const r = await run(cwd, "bash", ["-c", script])
          results.push({ name: "typecheck", passed: r.code === 0, output: truncate(r.stdout || r.stderr) })
        } else {
          results.push({ name: "typecheck", passed: true, output: "无 typecheck 配置，跳过" })
        }
      }
    } else if (item === "lsp") {
      results.push({ name: "lsp", passed: true, output: "LSP 诊断在任务内反馈" })
    }
  }
  return results
}

function truncate(s: string, max = 2000): string {
  return s.length > max ? s.slice(0, max) + `...(截断 ${s.length})` : s
}
