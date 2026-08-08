import type { ReviewResult } from "./reviewer"

export function formatReport(results: ReviewResult[], committed: boolean, pushed: boolean): string {
  if (results.length === 0) return ""
  const parts: string[] = ["## 玄鉴代码审查 Xuanjian Code Review", ""]

  let totalIssues = 0
  let criticalCount = 0
  let allPassed = true

  for (const result of results) {
    totalIssues += result.issues.length
    criticalCount += result.issues.filter((i) => i.severity === "critical").length
    if (!result.passed) allPassed = false

    parts.push(`### ${result.passed ? "[通过]" : "[失败]"} ${result.reviewer}`)
    if (result.issues.length === 0) {
      parts.push("无问题。")
      parts.push("")
      continue
    }
    for (const issue of result.issues) {
      const level = issue.severity === "critical" ? "[严重]" : issue.severity === "warning" ? "[警告]" : "[提示]"
      const lineInfo = issue.line !== undefined ? `:${issue.line}` : ""
      parts.push(`- ${level} **${issue.file}${lineInfo}** — ${issue.description}`)
      if (issue.suggestion) parts.push(`  - 建议: ${issue.suggestion}`)
    }
    parts.push("")
  }

  const summary = [
    `**总结**: ${totalIssues} 个问题（${criticalCount} critical）`,
    allPassed ? "全部审查通过。" : "存在审查问题。",
    committed ? "已自动提交。" : "",
    pushed ? "已自动推送。" : "",
  ]
    .filter(Boolean)
    .join(" | ")
  parts.push(summary)
  return parts.join("\n")
}
