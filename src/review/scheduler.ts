import type { Config, ReviewerConfig, ReviewConfig } from "../config/schema"
import { generateText } from "../llm/client"

const DEFAULT_SCHEDULER_PROMPT = [
  "You are a review dispatcher. Given a completed task and changed files, decide which reviewers to invoke.",
  "",
  "Available reviewers and their triggers:",
  "{{reviewers}}",
  "",
  "Completed task:",
  "{{todo}}",
  "",
  "Changed files:",
  "{{files}}",
  "",
  "Return a JSON array of reviewer names to invoke. Only select reviewers whose triggers match the task domain.",
  'If no reviewer matches, return []',
].join("\n")

export async function dispatch(input: {
  scheduler: ReviewConfig["scheduler"]
  reviewers: ReviewerConfig[]
  todo: string
  files: string[]
  mainModel: string
  configFile: Config
  signal?: AbortSignal
}): Promise<ReviewerConfig[]> {
  if (input.reviewers.length === 0) return []
  const model = input.scheduler?.model || input.mainModel
  const reviewersList = input.reviewers
    .map((r) => `- **${r.name}**: ${r.description} (triggers: ${r.triggers.join(", ")})`)
    .join("\n")
  const prompt = (input.scheduler?.prompt || DEFAULT_SCHEDULER_PROMPT)
    .replace("{{reviewers}}", reviewersList)
    .replace("{{todo}}", input.todo || "(no context)")
    .replace("{{files}}", input.files.join("\n") || "No file changes")

  try {
    const text = await generateText(model, { system: "You are a review dispatcher. Respond only with a JSON array of reviewer names.", prompt }, input.configFile)
    const names = parseSchedulerOutput(text)
    const map = new Map(input.reviewers.map((r) => [r.name, r]))
    return names.map((n) => map.get(n)).filter((r): r is ReviewerConfig => r !== undefined)
  } catch {
    return []
  }
}

export function parseSchedulerOutput(text: string): string[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}
