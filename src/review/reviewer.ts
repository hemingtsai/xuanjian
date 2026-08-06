import type { Config, ReviewerConfig } from "../config/schema"
import { generateText } from "../llm/client"
import type { DiffResult } from "./diff"

export interface ReviewIssue {
  file: string
  line?: number
  severity: "critical" | "warning" | "info"
  description: string
  suggestion: string
}

export interface ReviewResult {
  reviewer: string
  passed: boolean
  issues: ReviewIssue[]
}

export const DEFAULT_REVIEWER_PROMPT = [
  "You are a code reviewer. Review the following code changes and identify issues.",
  "",
  "Changed files and their diffs:",
  "{{diff}}",
  "",
  "Task context:",
  "{{todo}}",
  "",
  "Return your review as a single JSON object:",
  '{ "passed": true/false, "issues": [ { "file", "line"(optional), "severity"("critical"|"warning"|"info"), "description", "suggestion" } ] }',
  "",
  "Focus on: correctness, security, performance, maintainability, best practices.",
  "If no issues found, return passed: true with an empty issues array.",
].join("\n")

export async function runReviewer(input: {
  config: ReviewerConfig
  diff: DiffResult
  todo: string
  mainModel: string
  configFile: Config
  signal?: AbortSignal
}): Promise<ReviewResult> {
  const diffText = input.diff.files
    .map((file) => `### ${file}\n\`\`\`diff\n${input.diff.diffs.get(file) ?? ""}\n\`\`\``)
    .join("\n\n")
  const prompt = (input.config.prompt || DEFAULT_REVIEWER_PROMPT)
    .replace("{{diff}}", diffText || "No file changes detected")
    .replace("{{todo}}", input.todo || "(no context)")
  const model = input.config.model || input.mainModel

  try {
    const text = await generateText(model, { system: `You are "${input.config.name}" — ${input.config.description}`, prompt }, input.configFile)
    return parseReviewOutput(text, input.config.name)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      reviewer: input.config.name,
      passed: false,
      issues: [{ file: "", severity: "warning", description: `审查调用失败: ${message}`, suggestion: "" }],
    }
  }
}

export function parseReviewOutput(text: string, reviewerName: string): ReviewResult {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { reviewer: reviewerName, passed: true, issues: [] }
    const parsed = JSON.parse(jsonMatch[0]) as { passed?: unknown; issues?: unknown }
    return {
      reviewer: reviewerName,
      passed: parsed.passed !== false,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues
            .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
            .map((issue) => ({
              file: String(issue.file ?? ""),
              ...(issue.line !== undefined ? { line: Number(issue.line) } : {}),
              severity: (["critical", "warning", "info"].includes(String(issue.severity))
                ? String(issue.severity)
                : "info") as ReviewIssue["severity"],
              description: String(issue.description ?? ""),
              suggestion: String(issue.suggestion ?? ""),
            }))
        : [],
    }
  } catch {
    return { reviewer: reviewerName, passed: true, issues: [] }
  }
}
