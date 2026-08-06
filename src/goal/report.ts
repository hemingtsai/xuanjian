import type { Goal } from "./goal"

export function formatGoalReport(goal: Goal): string {
  const lines: string[] = []
  lines.push(`目标: ${goal.title}  ${goal.status === "done" ? "✅ 完成" : `（${goal.status}）`}`)
  lines.push("")
  lines.push("任务:")
  for (const task of goal.tasks) {
    const icon = task.status === "done" ? "✅" : task.status === "blocked" ? "⛔" : task.status === "in_progress" ? "🔄" : task.status === "skipped" ? "⏭" : "⬜"
    const deps = task.deps.length > 0 ? ` (依赖: ${task.deps.length})` : ""
    lines.push(`  ${icon} ${task.title}${deps}`)
    if (task.status === "blocked") lines.push(`      ⛔ 已受阻（尝试 ${task.attempts} 次）`)
  }
  const done = goal.tasks.filter((t) => t.status === "done").length
  const total = goal.tasks.length
  lines.push("")
  lines.push(`进度: ${done}/${total} 任务完成`)
  return lines.join("\n")
}
