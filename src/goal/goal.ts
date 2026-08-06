import { newUUID } from "../core/session"
import type { Store } from "../storage/db"

export type GoalStatus = "planning" | "active" | "paused" | "done" | "blocked" | "cancelled"
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked" | "skipped"

export interface GoalTask {
  id: string
  title: string
  description?: string
  goal_id: string
  status: TaskStatus
  deps: string[]
  checkpoint?: "write"
  attempts: number
  max_attempts: number
  result?: {
    notes?: string
    review?: string
  }
  milestone: boolean
}

export interface Goal {
  id: string
  title: string
  description?: string
  status: GoalStatus
  model?: string
  cwd: string
  tasks: GoalTask[]
  created_at: number
  updated_at: number
}

export class GoalStore {
  private store: Store
  private cache = new Map<string, Goal>()

  constructor(store: Store) {
    this.store = store
  }

  create(input: { title: string; description?: string; model?: string; cwd?: string }): Goal {
    const goal: Goal = {
      id: newUUID(),
      title: input.title,
      description: input.description,
      status: "planning",
      model: input.model,
      cwd: input.cwd ?? process.cwd(),
      tasks: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    this.save(goal)
    return goal
  }

  load(id: string): Goal | undefined {
    const cached = this.cache.get(id)
    if (cached) return cached
    const record = this.store.getGoal(id)
    if (!record) return undefined
    const data = record.data ? (JSON.parse(record.data) as { tasks?: GoalTask[]; cwd?: string }) : {}
    const goal: Goal = {
      id: record.id,
      title: record.title,
      description: record.description,
      status: record.status as GoalStatus,
      model: record.model,
      cwd: data.cwd ?? process.cwd(),
      tasks: data.tasks ?? [],
      created_at: record.created_at,
      updated_at: record.updated_at,
    }
    this.cache.set(id, goal)
    return goal
  }

  save(goal: Goal): void {
    goal.updated_at = Date.now()
    this.cache.set(goal.id, goal)
    this.store.upsertGoal({
      id: goal.id,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      model: goal.model,
      data: JSON.stringify({ tasks: goal.tasks, cwd: goal.cwd }),
      created_at: goal.created_at,
      updated_at: goal.updated_at,
    })
  }

  list(): Goal[] {
    return this.store.listGoals().map((r) => this.load(r.id)).filter((g): g is Goal => g !== undefined)
  }

  addTask(goal: Goal, input: { title: string; description?: string; deps?: string[]; checkpoint?: "write"; milestone?: boolean }): GoalTask {
    const task: GoalTask = {
      id: newUUID(),
      title: input.title,
      description: input.description,
      goal_id: goal.id,
      status: "todo",
      deps: input.deps ?? [],
      checkpoint: input.checkpoint,
      attempts: 0,
      max_attempts: 3,
      milestone: input.milestone ?? false,
    }
    goal.tasks.push(task)
    this.save(goal)
    return task
  }
}
