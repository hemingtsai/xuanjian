import { test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { createRuntime } from "../src/core/runtime"
import { TuiController } from "../src/tui/controller"
import { App } from "../src/tui/App"
import type { Config } from "../src/config/schema"

const config: Config = {
  default_agent: "build",
  theme: "dark",
  provider: {},
  lsp: {},
  permission: { default: "ask", allow: [], deny: [] },
  agents: {},
  review: {},
  goal: {},
  plugins: [],
}

test("TUI App 初始渲染：banner + 状态栏 + 输入框", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp", agent: "build" })
  const controller = new TuiController(runtime, session)
  controller.out.push({ type: "system", text: "banner" })

  const { renderer, renderOnce, captureCharFrame } = await testRender(() => <App controller={controller} />, {
    width: 60,
    height: 12,
  })
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("banner")
  expect(frame).toContain("模型:")
  expect(frame).toContain("工作区:")
  expect(frame).toContain("LSP:")
  expect(frame).toContain("DAP:")
  expect(frame).toContain("ctx:")
  expect(frame).toContain("输入消息")

  runtime.store.close()
})

test("TUI App 初始渲染：权限 modal 可见（预置状态）", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)
  controller.setModal({ kind: "permission", text: "请求权限: bash git status", resolve: () => {} })

  const { renderer, renderOnce, captureCharFrame } = await testRender(() => <App controller={controller} />, {
    width: 60,
    height: 12,
  })
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("请求权限: bash git status")

  controller.resolveModal("allow")
  expect(controller.modal()).toBeNull()

  runtime.store.close()
})

test("TuiController 提交斜杠命令 → 输出部分", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  await controller.submit("/help")
  const types = controller.out.parts().map((p) => p.type)
  expect(types).toContain("user")
  expect(types).toContain("error")

  runtime.store.close()
})

test("TuiController 未配置模型 → 错误提示", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  await controller.submit("你好")
  const text = controller.out.parts().map((p) => ("text" in p ? p.text : "")).join(" ")
  expect(text).toContain("未配置模型")

  runtime.store.close()
})

test("TuiController 历史记录", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  await controller.submit("/help")
  expect(controller.historyPrev()).toBe("/help")
  expect(controller.historyNext()).toBe("")

  runtime.store.close()
})
