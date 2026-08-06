import { liveContext, bufferReviewer, requireLuaContext } from "./context"
import { runReview } from "../../review/pipeline"
import type { ReviewerConfig } from "../../config/schema"

export interface LuaReviewerDef {
  name: string
  model: string
  description: string
  prompt?: string
  triggers: string[]
}

export function registerReviewer(def: LuaReviewerDef): void {
  if (!def || typeof def.name !== "string" || def.name.length === 0) throw new Error("x.review.register 需要 name")
  const entry: ReviewerConfig = {
    name: def.name,
    model: def.model,
    description: def.description ?? "",
    prompt: def.prompt,
    triggers: def.triggers ?? [],
  }
  const ctx = liveContext()
  if (ctx) {
    ctx.config.review.reviewers = [...(ctx.config.review.reviewers ?? []).filter((r) => r.name !== def.name), entry]
  } else {
    bufferReviewer(entry)
  }
}

export function run(input: { todo: string; files?: string[] }): Promise<Record<string, unknown>> {
  const ctx = requireLuaContext()
  const model = ctx.config.model
  if (!model) return Promise.reject(new Error("未配置 model，无法运行审查"))
  return runReview({
    todo: input.todo ?? "",
    cwd: ctx.cwd,
    config: ctx.config,
    model,
  }).then((o) => ({ results: o.results, report: o.report, committed: o.committed, pushed: o.pushed }))
}

export const luaReview = { register: registerReviewer, run }
