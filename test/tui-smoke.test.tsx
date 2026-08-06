import { test, expect } from "bun:test"
import { testRender } from "@opentui/solid"

test("opentui stack renders box + text + scrollbox", async () => {
  const { renderer, renderOnce, captureCharFrame } = await testRender(
    () => (
      <box flexDirection="column" width={30} height={6} borderStyle="rounded">
        <text>标题行</text>
        <scrollbox>
          <text>滚 1</text>
          <text>滚 2</text>
        </scrollbox>
        <text>底部</text>
      </box>
    ),
    { width: 30, height: 6 },
  )
  await renderOnce()
  const frame = captureCharFrame()
  expect(frame).toContain("标题行")
  expect(frame).toContain("滚 1")
  expect(frame).toContain("底部")
})

test("diff component renders unified diff", async () => {
  const { renderer, renderOnce, captureCharFrame } = await testRender(
    () => (
      <box width={40} height={8}>
        <diff
          diff={`--- a/x.ts
+++ b/x.ts
@@ -1,3 +1,4 @@
 const a = 1
-const b = 2
+const b = 3
 const c = 4
`}
        />
      </box>
    ),
    { width: 40, height: 8 },
  )
  await renderOnce()
  const frame = captureCharFrame()
  expect(frame).toContain("const b")
})
