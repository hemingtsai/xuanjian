import { newUUID } from "../core/session"
import type { Config } from "../config/schema"
import type { Goal, GoalTask } from "./goal"

const PLANNER_SYSTEM = `You are Xuanjian (玄鉴) planner. Break the user's goal into a concise task plan.
Respond with ONLY a JSON array of tasks, each: { "title", "description", "deps" (array of earlier task titles), "milestone" (bool) }.
Milestones are tasks whose completion is a meaningful checkpoint.`

export interface PlannedTask {
  title: string
  description?: string
  deps: string[]
  milestone?: boolean
}

export async function planGoal(input: {
  goal: Goal
  model: string
  config: Config
  runLlm: (system: string, prompt: string) => Promise<string>
}): Promise<PlannedTask[]> {
  const prompt = `目标: ${input.goal.title}${input.goal.description ? `\n说明: ${input.goal.description}` : ""}`
  const raw = await input.runLlm(PLANNER_SYSTEM, prompt)
  return parsePlan(raw)
}

export function materializePlan(goal: Goal, planned: PlannedTask[], maxAttempts: number): GoalTask[] {
  const idByTitle = new Map<string, string>()
  const tasks: GoalTask[] = []
  for (const p of planned) {
    const task: GoalTask = {
      id: newUUID(),
      title: p.title,
      description: p.description,
      goal_id: goal.id,
      status: "todo",
      deps: [],
      attempts: 0,
      max_attempts: maxAttempts,
      milestone: p.milestone ?? false,
    }
    idByTitle.set(p.title, task.id)
    tasks.push(task)
  }
  for (let i = 0; i < planned.length; i++) {
    const task = tasks[i]!
    task.deps = (planned[i]!.deps ?? []).map((title) => idByTitle.get(title) ?? "").filter((id) => id !== task.id)
  }
  return tasks
}

export function parsePlan(text: string): PlannedTask[] {
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map((t) => ({
        title: String(t.title ?? ""),
        description: t.description !== undefined ? String(t.description) : undefined,
        deps: Array.isArray(t.deps) ? t.deps.map(String) : [],
        milestone: t.milestone === true,
      }))
      .filter((t) => t.title.length > 0)
  } catch {
    return []
  }
}
