import { spawn } from "node:child_process"
import type { Config } from "../config/schema"
import { generateText } from "../llm/client"
import type { ReviewResult } from "./reviewer"

function runGit(cwd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    proc.stdout.on("data", (c: Buffer) => (stdout += c.toString()))
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout }))
    proc.on("error", () => resolve({ code: 1, stdout: "" }))
  })
}

async function generateCommitMessage(input: { model: string; todo: string; configFile: Config }): Promise<string> {
  try {
    const text = await generateText(
      input.model,
      {
        system: "You generate concise conventional git commit messages.",
        prompt: `Generate a one-line conventional commit message for: ${input.todo || "code changes"}\nFormat: type(scope): summary`,
      },
      input.configFile,
    )
    return text.trim().split("\n")[0] || "chore: update"
  } catch {
    return "chore: update"
  }
}

export async function commitAndPush(input: {
  cwd: string
  autoCommit: boolean
  autoPush: boolean
  model: string
  todo: string
  reviewResults: ReviewResult[]
  configFile: Config
}): Promise<{ committed: boolean; pushed: boolean }> {
  if (!input.autoCommit) return { committed: false, pushed: false }

  const criticalCount = input.reviewResults.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "critical").length, 0)
  if (criticalCount > 0) return { committed: false, pushed: false }

  const message = await generateCommitMessage({ model: input.model, todo: input.todo, configFile: input.configFile })
  const add = await runGit(input.cwd, ["add", "-A"])
  if (add.code !== 0) return { committed: false, pushed: false }
  const commit = await runGit(input.cwd, ["commit", "-m", message])
  if (commit.code !== 0) return { committed: false, pushed: false }

  if (input.autoPush) {
    const push = await runGit(input.cwd, ["push"])
    return { committed: true, pushed: push.code === 0 }
  }
  return { committed: true, pushed: false }
}
