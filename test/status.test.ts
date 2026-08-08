import { test, expect } from "bun:test"
import { formatWorkspace } from "../src/tui/status"

test("formatWorkspace 工作区显示为目录路径", () => {
  const home = process.env.HOME!
  expect(formatWorkspace(home)).toBe("~")
  expect(formatWorkspace(`${home}/Projects/xuanjian`)).toBe("~/Projects/xuanjian")
  expect(formatWorkspace("/tmp")).toBe("/tmp")
})
