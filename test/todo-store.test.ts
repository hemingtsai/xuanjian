import { test, expect } from "bun:test"
import { TodoStore } from "../src/core/todo-store"
import { fixTasksFromReview } from "../src/review/pipeline"

test("TodoStore setItems + current", () => {
  const store = new TodoStore()
  store.setItems([
    { id: "a", task: "任务 A", status: "todo" },
    { id: "b", task: "任务 B", status: "in_progress" },
  ])
  expect(store.items().length).toBe(2)
  expect(store.current()?.id).toBe("b")
  expect(store.items().find((i) => i.id === "b")?.status).toBe("in_progress")
})

test("TodoStore setCurrent 迁移 in_progress", () => {
  const store = new TodoStore()
  store.setItems([
    { id: "a", task: "任务 A", status: "in_progress" },
    { id: "b", task: "任务 B", status: "todo" },
  ])
  store.setCurrent("b")
  expect(store.current()?.id).toBe("b")
  expect(store.items().find((i) => i.id === "a")?.status).toBe("todo")
})

test("TodoStore patchStatus 标记完成", () => {
  const store = new TodoStore()
  store.setItems([{ id: "a", task: "任务 A", status: "todo" }])
  store.patchStatus("a", "done")
  expect(store.items()[0]?.status).toBe("done")
})

test("TodoStore insertFixTasks 插到当前 todo 之后", () => {
  const store = new TodoStore()
  store.setItems([
    { id: "a", task: "任务 A", status: "in_progress" },
    { id: "c", task: "任务 C", status: "todo" },
  ])
  const n = store.insertFixTasks([{ task: "修正 1" }, { task: "修正 2" }])
  expect(n).toBe(2)
  const tasks = store.items().map((i) => i.task)
  expect(tasks).toEqual(["任务 A", "修正 1", "修正 2", "任务 C"])
  expect(store.items().slice(1, 3).every((i) => i.status === "todo" && i.milestone === "review-fix")).toBe(true)
})

test("TodoStore insertFixTasks 无进行中任务时追加到末尾", () => {
  const store = new TodoStore()
  store.setItems([{ id: "a", task: "任务 A", status: "todo" }])
  store.insertFixTasks([{ task: "修正 1" }])
  expect(store.items().map((i) => i.task)).toEqual(["任务 A", "修正 1"])
})

test("TodoStore addReview + latestReview", () => {
  const store = new TodoStore()
  expect(store.latestReview()).toBeUndefined()
  store.addReview("review", "报告一")
  store.addReview("milestone", "")
  store.addReview("milestone", "报告二")
  const latest = store.latestReview()
  expect(latest?.source).toBe("milestone")
  expect(latest?.report).toBe("报告二")
  expect(store.reviews().length).toBe(2)
})

test("fixTasksFromReview 提取 critical/warning，跳过 info", () => {
  const tasks = fixTasksFromReview([
    {
      reviewer: "security",
      passed: false,
      issues: [
        { file: "a.ts", line: 3, severity: "critical", description: "XSS", suggestion: "escape" },
        { file: "b.ts", severity: "warning", description: "慢查询", suggestion: "" },
        { file: "c.ts", severity: "info", description: "风格", suggestion: "" },
      ],
    },
  ])
  expect(tasks.length).toBe(2)
  expect(tasks[0]!.task).toContain("a.ts:3")
  expect(tasks[0]!.task).toContain("escape")
  expect(tasks[1]!.task).toContain("b.ts")
})

test("fixTasksFromReview 无问题时为空", () => {
  expect(fixTasksFromReview([{ reviewer: "r", passed: true, issues: [] }])).toEqual([])
})
