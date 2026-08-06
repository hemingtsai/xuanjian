import { spawn } from "node:child_process"

export interface DiffResult {
  files: string[]
  diffs: Map<string, string>
}

function runGit(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()))
    proc.stderr.on("data", (c: Buffer) => (stderr += c.toString()))
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }))
    proc.on("error", (err) => resolve({ code: 1, stdout: "", stderr: err.message }))
  })
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const { code } = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"])
  return code === 0
}

export async function collectDiff(cwd: string): Promise<DiffResult> {
  if (!(await isGitRepo(cwd))) return { files: [], diffs: new Map() }

  const head = await runGit(cwd, ["rev-parse", "--verify", "HEAD"])
  if (head.code !== 0) return { files: [], diffs: new Map() }

  const { code, stdout } = await runGit(cwd, ["diff", "HEAD", "--unified=3"])
  if (code !== 0 || stdout.trim() === "") return { files: [], diffs: new Map() }

  const diffs = new Map<string, string>()
  let currentFile: string | undefined
  let currentLines: string[] = []

  const flush = () => {
    if (currentFile && currentLines.length > 0) {
      diffs.set(currentFile, currentLines.join("\n"))
    }
    currentFile = undefined
    currentLines = []
  }

  for (const rawLine of stdout.split("\n")) {
    if (rawLine.startsWith("diff --git ")) {
      flush()
      const match = rawLine.match(/^diff --git a\/(.*) b\/(.*)$/)
      currentFile = match ? match[2] ?? match[1] : undefined
      continue
    }
    if (!currentFile) continue
    if (rawLine.startsWith("--- /dev/null") || rawLine.startsWith("+++ /dev/null")) continue
    if (rawLine.startsWith("index ") || rawLine.startsWith("new file") || rawLine.startsWith("deleted file")) continue
    currentLines.push(rawLine)
  }
  flush()

  const files = Array.from(diffs.keys())
  return { files, diffs }
}
