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

test("TUI onboarding: 无 model 且无凭据时显示引导栏", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  const { renderer, renderOnce, captureCharFrame } = await testRender(() => <App controller={controller} />, {
    width: 60,
    height: 12,
  })
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("尚未连接任何 provider")

  runtime.store.close()
})

test("TuiController select 模态 + 连接向导流程", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  expect(controller.needsOnboarding()).toBe(true)

  const promise = controller.selectFromList("选 provider", [
    { name: "anthropic", description: "Claude 系列", value: "anthropic" },
    { name: "openai", description: "GPT 系列", value: "openai" },
  ])
  const modal = controller.modal()
  expect(modal?.kind).toBe("select")
  controller.resolveModal("anthropic")
  const selected = await promise
  expect(selected).toBe("anthropic")
  expect(controller.modal()).toBeNull()

  runtime.store.close()
})

test("openAuthWizard: 选 provider → 输 key → 保存凭据并设模型", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  const wizard = controller.openAuthWizard()
  await new Promise((r) => setTimeout(r, 0))
  expect(controller.modal()?.kind).toBe("select")

  controller.resolveModal("anthropic")
  await new Promise((r) => setTimeout(r, 0))
  expect(controller.modal()?.kind).toBe("ask")

  controller.resolveModal("sk-ant-unit-test")
  await wizard

  const { hasApiKey } = await import("../src/config/credentials")
  expect(hasApiKey("anthropic")).toBe(true)
  expect(controller.runtime.config.model).toBe("anthropic/claude-sonnet-4-5")

  const { deleteCredential } = await import("../src/config/credentials")
  deleteCredential("anthropic")
  runtime.store.close()
})

test("switchWorkspace: 非空会话拒绝，空会话允许", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/old" })
  const controller = new TuiController(runtime, session)

  // 非空会话 → 拒绝
  session.addMessage({ role: "user", content: "任务" })
  const denied = controller.switchWorkspace("/new")
  expect(denied).toContain("无法切换工作区")
  expect(session.cwd).toBe("/old")

  // 空会话 → 允许
  const empty = runtime.sessions.create({ cwd: "/old" })
  const controller2 = new TuiController(runtime, empty)
  const ok = controller2.switchWorkspace("/new")
  expect(ok).toContain("已切换工作区")
  expect(empty.cwd).toBe("/new")

  runtime.store.close()
})

test("粘贴到输入框 + 复制最后回复", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  const { renderer, renderOnce, mockInput, captureCharFrame } = await testRender(() => <App controller={controller} />, { width: 60, height: 12 })
  await renderOnce()

  // 粘贴
  await mockInput.pasteBracketedText("粘贴的文本")
  await renderOnce()
  const frame = captureCharFrame()
  expect(frame).toContain("粘贴的文本")

  // 复制最后回复（OSC52 剪贴板回调）
  let copied = ""
  controller.clipboard = (text) => {
    copied = text
    return true
  }
  controller.out.push({ type: "assistant", text: "这是回复内容" })
  const result = controller.copy(controller.lastAssistantText())
  expect(copied).toBe("这是回复内容")
  expect(result).toContain("已复制")

  runtime.store.close()
})
