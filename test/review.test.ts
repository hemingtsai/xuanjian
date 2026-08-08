import { test, expect } from "bun:test"
import { parseReviewOutput } from "../src/review/reviewer"
import { parseSchedulerOutput } from "../src/review/scheduler"
import { collectDiff } from "../src/review/diff"
import { formatReport } from "../src/review/report"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"

test("parseReviewOutput structured", () => {
  const text = `Here is the review:\n{"passed": false, "issues": [{"file": "a.ts", "line": 3, "severity": "critical", "description": "XSS", "suggestion": "escape"}]}`
  const result = parseReviewOutput(text, "security")
  expect(result.reviewer).toBe("security")
  expect(result.passed).toBe(false)
  expect(result.issues[0]!.severity).toBe("critical")
})

test("parseReviewOutput fallback on garbage", () => {
  const result = parseReviewOutput("no json here", "r")
  expect(result.passed).toBe(true)
  expect(result.issues).toEqual([])
})

test("parseSchedulerOutput", () => {
  expect(parseSchedulerOutput('["security", "quality"]')).toEqual(["security", "quality"])
  expect(parseSchedulerOutput("no array")).toEqual([])
})

test("formatReport renders summary", () => {
  const report = formatReport(
    [{ reviewer: "security", passed: false, issues: [{ file: "x", line: 1, severity: "critical", description: "d", suggestion: "s" }] }],
    false,
    false,
  )
  expect(report).toContain("[严重]")
  expect(report).toContain("1 个问题")
})

test("collectDiff in a git repo", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "xj-review-"))
  spawnSync("git", ["init", "-q"], { cwd: dir })
  spawnSync("git", ["config", "user.email", "t@t"], { cwd: dir })
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir })
  writeFileSync(path.join(dir, "a.txt"), "one\ntwo\n")
  spawnSync("git", ["add", "-A"], { cwd: dir })
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: dir })
  writeFileSync(path.join(dir, "a.txt"), "one\nTWO\n")
  const result = await collectDiff(dir)
  expect(result.files).toContain("a.txt")
  expect(result.diffs.get("a.txt") ?? "").toContain("+TWO")
  rmSync(dir, { recursive: true, force: true })
})

test("collectDiff in non-repo returns empty", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "xj-review-"))
  const result = await collectDiff(dir)
  expect(result.files).toEqual([])
  rmSync(dir, { recursive: true, force: true })
})
