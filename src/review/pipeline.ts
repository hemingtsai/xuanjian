import type { Config } from "../config/schema"
import * as Events from "../core/events"
import { collectDiff } from "./diff"
import { dispatch } from "./scheduler"
import { runReviewer } from "./reviewer"
import type { ReviewResult } from "./reviewer"
import { commitAndPush } from "./commit"
import { formatReport } from "./report"

export interface ReviewInput {
  todo: string
  cwd: string
  config: Config
  model: string
  noAutoCommit?: boolean
  signal?: AbortSignal
}

export interface ReviewOutput {
  results: ReviewResult[]
  report: string
  committed: boolean
  pushed: boolean
}

/** 从审查结果中提取修正任务（跳过 info 级别），用于插入到当前待办之后 */
export function fixTasksFromReview(results: ReviewResult[]): { task: string; milestone?: string }[] {
  const tasks: { task: string; milestone?: string }[] = []
  for (const result of results) {
    for (const issue of result.issues) {
      if (issue.severity === "info") continue
      const loc = issue.file
        ? `${issue.file}${issue.line !== undefined ? `:${issue.line}` : ""}`
        : result.reviewer
      const suggestion = issue.suggestion ? `（建议: ${issue.suggestion}）` : ""
      tasks.push({ task: `修复 ${loc}: ${issue.description}${suggestion}` })
    }
  }
  return tasks
}

export async function runReview(input: ReviewInput): Promise<ReviewOutput> {
  const diff = await collectDiff(input.cwd)
  const files = diff.files
  const reviewers = input.config.review.reviewers ?? []

  if (files.length === 0 && reviewers.length === 0) {
    return { results: [], report: "", committed: false, pushed: false }
  }

  const selected = await dispatch({
    scheduler: input.config.review.scheduler,
    reviewers,
    todo: input.todo,
    files,
    mainModel: input.model,
    configFile: input.config,
    signal: input.signal,
  })

  if (selected.length === 0) {
    return { results: [], report: "", committed: false, pushed: false }
  }

  const results = await Promise.all(
    selected.map((reviewer) =>
      runReviewer({ config: reviewer, diff, todo: input.todo, mainModel: input.model, configFile: input.config, signal: input.signal }),
    ),
  )

  const { committed, pushed } = await commitAndPush({
    cwd: input.cwd,
    autoCommit: !input.noAutoCommit && (input.config.review.auto_commit ?? false),
    autoPush: !input.noAutoCommit && (input.config.review.auto_push ?? false),
    model: input.model,
    todo: input.todo,
    reviewResults: results,
    configFile: input.config,
  })

  const report = formatReport(results, committed, pushed)
  await Events.emit("review.completed", { results, report, committed, pushed })
  return { results, report, committed, pushed }
}
