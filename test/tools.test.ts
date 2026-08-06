import { test, expect } from "bun:test"
import { WriteTool } from "../src/tools/write"
import { EditTool } from "../src/tools/edit"
import { ReadTool } from "../src/tools/read"
import { ApplyPatchTool, parsePatch } from "../src/tools/apply_patch"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const cwd = mkdtempSync(path.join(tmpdir(), "xj-tools-"))
const ctx = { cwd }

test("write + read", async () => {
  await WriteTool.call(ctx, { file_path: "a.txt", content: "line1\nline2\nline3\n" })
  const r = await ReadTool.call(ctx, { file_path: "a.txt" })
  expect(r.output).toContain("line2")
})

test("edit unique replace", async () => {
  await EditTool.call(ctx, { file_path: "a.txt", old_string: "line2", new_string: "LINE2" })
  const r = await ReadTool.call(ctx, { file_path: "a.txt" })
  expect(r.output).toContain("LINE2")
  expect(r.output).not.toContain("line2\n")
})

test("edit multiple requires replace_all", async () => {
  await WriteTool.call(ctx, { file_path: "b.txt", content: "x\ny\nx\n" })
  await expect(EditTool.call(ctx, { file_path: "b.txt", old_string: "x", new_string: "z" })).rejects.toThrow()
  await EditTool.call(ctx, { file_path: "b.txt", old_string: "x", new_string: "z", replace_all: true })
  const r = await ReadTool.call(ctx, { file_path: "b.txt" })
  expect(r.output).toContain("z")
})

test("apply_patch update", async () => {
  await WriteTool.call(ctx, { file_path: "c.txt", content: "a\nb\nc\nd\n" })
  const patch = ["*** Begin Patch", "*** Update File: c.txt", "@@", " a", "-b", "+B", " c", "*** End Patch"].join("\n")
  const r = await ApplyPatchTool.call(ctx, { patch })
  expect(r.output).toContain("更新 c.txt")
  const content = await ReadTool.call(ctx, { file_path: "c.txt" })
  expect(content.output).toContain("B")
})

test("apply_patch add + delete file", async () => {
  await WriteTool.call(ctx, { file_path: "del.txt", content: "gone" })
  const patch = ["*** Begin Patch", "*** Add File: new.txt", "hello", "world", "*** Delete File: del.txt", "*** End Patch"].join("\n")
  await ApplyPatchTool.call(ctx, { patch })
  const r = await ReadTool.call(ctx, { file_path: "new.txt" })
  expect(r.output).toContain("hello")
})

test("parsePatch handles all section kinds", () => {
  const patch = ["*** Begin Patch", "*** Add File: a.txt", "1", "*** Delete File: b.txt", "*** End Patch"].join("\n")
  const sections = parsePatch(patch)
  expect(sections.map((s) => s.kind)).toEqual(["add", "delete"])
})

rmSync(cwd, { recursive: true, force: true })
