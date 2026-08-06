import { requireLuaContext } from "./context"
import type { Goal, GoalTask } from "../../goal/goal"

export interface LuaGoalCreate {
  title: string
  description?: string
  model?: string
  milestones?: string[]
}

export function create(input: LuaGoalCreate): string {
  if (!input || typeof input.title !== "string" || input.title.length === 0) throw new Error("x.goal.create 需要 title")
  const ctx = requireLuaContext()
  const model = input.model ?? ctx.config.model
  const goal = ctx.goals.create({ title: input.title, description: input.description, model, cwd: ctx.cwd })
  if (input.milestones && input.milestones.length > 0) {
    for (const title of input.milestones) {
      ctx.goals.addTask(goal, { title, milestone: true })
    }
  }
  return goal.id
}

export function current(): Record<string, unknown> | undefined {
  const ctx = requireLuaContext()
  const goal = ctx.goals.list().find((g) => g.status === "active" || g.status === "planning")
  if (!goal) return undefined
  return toPlain(goal)
}

export function addTask(goalId: string, input: { title: string; description?: string; deps?: string[]; checkpoint?: "write" }): string {
  const ctx = requireLuaContext()
  const goal = ctx.goals.load(goalId)
  if (!goal) throw new Error(`goal 不存在: ${goalId}`)
  const task = ctx.goals.addTask(goal, {
    title: input.title,
    description: input.description,
    deps: input.deps,
    checkpoint: input.checkpoint,
    milestone: false,
  })
  return task.id
}

export function complete(taskId: string): void {
  const ctx = requireLuaContext()
  for (const goal of ctx.goals.list()) {
    const task = goal.tasks.find((t) => t.id === taskId)
    if (task) {
      task.status = "done"
      ctx.goals.save(goal)
      return
    }
  }
  throw new Error(`task 不存在: ${taskId}`)
}

export function pause(): void {
  const ctx = requireLuaContext()
  const goal = currentGoal(ctx)
  if (goal) {
    goal.status = "paused"
    ctx.goals.save(goal)
  }
}

export function abort(goalId?: string): void {
  const ctx = requireLuaContext()
  const goal = goalId ? ctx.goals.load(goalId) : currentGoal(ctx)
  if (goal) {
    goal.status = "cancelled"
    ctx.goals.save(goal)
  }
}

export function status(goalId?: string): Record<string, unknown> | undefined {
  const ctx = requireLuaContext()
  const goal = goalId ? ctx.goals.load(goalId) : currentGoal(ctx)
  return goal ? toPlain(goal) : undefined
}

function currentGoal(ctx: ReturnType<typeof requireLuaContext>): Goal | undefined {
  return ctx.goals.list().find((g) => g.status === "active" || g.status === "planning")
}

function toPlain(goal: Goal): Record<string, unknown> {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    status: goal.status,
    cwd: goal.cwd,
    tasks: goal.tasks.map((t) => taskPlain(t)),
  }
}

function taskPlain(task: GoalTask): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    deps: task.deps,
    attempts: task.attempts,
    milestone: task.milestone,
  }
}

export const luaGoal = { create, current, add_task: addTask, complete, pause, abort, status }
