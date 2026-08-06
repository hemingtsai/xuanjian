import type { Runtime } from "../core/runtime"
import type { AgentInfo } from "../core/agent"
import { resolveAgent } from "../core/agent"
import * as Events from "../core/events"
import { runAgentTurn } from "../core/agent-loop"
import type { LoopSink } from "../core/agent-loop"
import type { PermissionAnswer } from "../core/agent-loop"
import { generateText } from "../llm/client"
import { runReview } from "../review/pipeline"
import { planGoal, materializePlan } from "./planner"
import { runVerification } from "./verify"
import { formatGoalReport } from "./report"
import type { Goal, GoalTask } from "./goal"

export interface GoalLoopOptions {
  runtime: Runtime
  goal: Goal
  agent?: AgentInfo
  model?: string
  sink?: Partial<LoopSink>
  askPermission?: (req: { tool: string; args: Record<string, unknown> }) => Promise<PermissionAnswer | undefined>
  onCheckpoint?: (task: GoalTask) => Promise<boolean>
}

function readyTasks(goal: Goal): GoalTask[] {
  const done = new Set(goal.tasks.filter((t) => t.status === "done").map((t) => t.id))
  return goal.tasks.filter((t) => t.status === "todo" && t.deps.every((d) => done.has(d)))
}

export { formatGoalReport } from "./report"

export async function executeGoal(opts: GoalLoopOptions): Promise<Goal> {
  const { runtime, goal } = opts
  const agent = opts.agent ?? resolveAgent(runtime.config.default_agent, runtime.config)
  const model = opts.model ?? goal.model ?? agent.model ?? runtime.config.model
  if (!model) throw new Error("未配置模型（goal 模式需要 model）")
  const sink = opts.sink ?? {}
  const maxSteps = runtime.config.goal.max_steps ?? 100

  if (goal.status === "planning") {
    sink.text?.(`规划目标: ${goal.title}\n`)
    const planned = await planGoal({
      goal,
      model,
      config: runtime.config,
      runLlm: (system, prompt) => generateText(model, { system, prompt }, runtime.config),
    })
    goal.tasks = materializePlan(goal, planned, runtime.config.goal.max_attempts ?? 3)
    goal.status = "active"
    runtime.goals.save(goal)
    await Events.emit("goal.started", { goal: goal })
  }

  let steps = 0

  while (goal.status === "active") {
    steps++
    if (steps > maxSteps) {
      goal.status = "blocked"
      await Events.emit("goal.blocked", { goal_id: goal.id, task: undefined, reason: `超过步数上限 (${maxSteps})` })
      break
    }

    const task = readyTasks(goal)[0]
    if (!task) {
      if (goal.tasks.length > 0 && goal.tasks.every((t) => t.status === "done")) {
        goal.status = "done"
      } else {
        goal.status = "blocked"
        await Events.emit("goal.blocked", { goal_id: goal.id, task: undefined, reason: "存在受阻任务或计划为空" })
      }
      break
    }

    task.status = "in_progress"
    runtime.goals.save(goal)
    sink.text?.(`\n🔨 任务: ${task.title}\n`)

    if (task.checkpoint === "write") {
      const proceed = opts.onCheckpoint ? await opts.onCheckpoint(task) : true
      if (!proceed) {
        task.status = "skipped"
        runtime.goals.save(goal)
        continue
      }
    }

    let passed = false
    while (task.attempts < task.max_attempts && !passed) {
      task.attempts++
      runtime.goals.save(goal)

      const taskSession = runtime.sessions.create({ cwd: goal.cwd, model, agent: agent.id })
      const turn = await runAgentTurn(task.title + (task.description ? `\n${task.description}` : ""), {
        session: taskSession,
        config: runtime.config,
        registry: runtime.registry,
        permission: runtime.permission,
        agent,
        model,
        sessionManager: runtime.sessions,
        lspManager: runtime.lsp,
        sink: { done: () => {} },
        askPermission: opts.askPermission,
        askUser: undefined,
      })
      task.result = { ...(task.result ?? {}), notes: turn.text }

      const verification = await runVerification(goal.cwd, runtime.config.goal.verification ?? ["test", "typecheck"])
      passed = verification.every((v) => v.passed)
      const failed = verification.filter((v) => !v.passed)
      if (!passed) {
        sink.text?.(`  验证失败: ${failed.map((v) => v.name).join(", ")} (尝试 ${task.attempts}/${task.max_attempts})\n`)
      }
    }

    if (!passed) {
      task.status = "blocked"
      goal.status = "paused"
      runtime.goals.save(goal)
      await Events.emit("goal.blocked", { goal_id: goal.id, task, reason: "验证未通过，重试耗尽" })
      break
    }

    if (task.milestone && (runtime.config.goal.auto_review ?? true)) {
      sink.text?.(`  里程碑审查: ${task.title}\n`)
      const review = await runReview({
        todo: task.title,
        cwd: goal.cwd,
        config: runtime.config,
        model,
        noAutoCommit: true,
      })
      task.result = { ...(task.result ?? {}), review: review.report }
      await Events.emit("goal.milestone.review", { goal_id: goal.id, task, review: review.report })
      const hasCritical = review.results.some((r) => r.issues.some((i) => i.severity === "critical"))
      if (hasCritical && task.attempts < task.max_attempts) {
        task.status = "todo"
        runtime.goals.save(goal)
        continue
      }
    }

    task.status = "done"
    runtime.goals.save(goal)
    await Events.emit("goal.task.done", { goal_id: goal.id, task })
  }

  if (goal.status === "done") {
    await Events.emit("goal.done", { goal_id: goal.id, report: formatGoalReport(goal) })
  }
  runtime.goals.save(goal)
  return goal
}
