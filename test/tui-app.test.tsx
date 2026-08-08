import { test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import http from "node:http"
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
    width: 100,
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
  expect(frame).toContain("模型:")

  runtime.store.close()
})

test("TuiController 权限请求 → parts 提示 → 输入应答", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  const promise = controller.askPermission({ tool: "bash", args: { command: "git status" } })
  const prompt = controller.out.parts().map((p) => ("text" in p ? p.text : "")).join(" ")
  expect(prompt).toContain("请求权限: bash git status")

  await controller.submit("y")
  const answer = await promise
  expect(answer).toBe("allow")
  const tail = controller.out.parts().map((p) => ("text" in p ? p.text : "")).join(" ")
  expect(tail).toContain("已允许")

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

test("TuiController 用户信息自动创建待办（当前进行中）", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  await controller.submit("你好")
  const todos = controller.runtime.todos.items()
  expect(todos.length).toBe(1)
  expect(todos[0]?.task).toBe("你好")
  expect(todos[0]?.status).toBe("in_progress")

  await controller.submit("继续做下一个任务")
  const todos2 = controller.runtime.todos.items()
  expect(todos2.length).toBe(2)
  expect(todos2[0]?.status).toBe("todo")
  expect(todos2[1]?.status).toBe("in_progress")

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
  const { listCredentials, deleteCredential } = await import("../src/config/credentials")
  for (const c of listCredentials()) deleteCredential(c.providerId)
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)
  expect(controller.needsOnboarding()).toBe(true)

  const { renderer, renderOnce, captureCharFrame } = await testRender(() => <App controller={controller} />, {
    width: 100,
    height: 12,
  })
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("尚未连接任何 provider")

  runtime.store.close()
})

test("TuiController 提问 → parts 提示 → 输入应答", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  const promise = controller.askUser("这是一个问题")
  const prompt = controller.out.parts().map((p) => ("text" in p ? p.text : "")).join(" ")
  expect(prompt).toContain("这是一个问题")

  await controller.submit("我的回答")
  const answer = await promise
  expect(answer).toBe("我的回答")
  const tail = controller.out.parts().map((p) => ("text" in p ? p.text : "")).join(" ")
  expect(tail).toContain("我的回答")

  runtime.store.close()
})

test("openAuthWizard: 主输入流选 provider → 输 key → 保存凭据并设模型", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)

  await controller.openAuthWizard()
  expect(controller.authStep).toBe("select")

  // 输入编号选择 anthropic
  expect(await controller.handleAuthInput("1")).toBe(true)
  expect(controller.authStep).toBe("key")

  // 输入 key
  expect(await controller.handleAuthInput("sk-ant-unit-test")).toBe(true)
  expect(controller.authStep).toBe("none")

  const { hasApiKey } = await import("../src/config/credentials")
  expect(hasApiKey("anthropic")).toBe(true)
  expect(controller.runtime.config.model).toBe("anthropic/claude-sonnet-4-5")
  expect(controller.status().model).toBe("anthropic/claude-sonnet-4-5")

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

  const { renderer, renderOnce, mockInput, captureCharFrame } = await testRender(() => <App controller={controller} />, { width: 100, height: 12 })
  await renderOnce()

  // 自定义输入框渲染 placeholder 与光标块
  const frame = captureCharFrame()
  expect(frame).toContain("模型:")

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

test("右侧面板：待办清单 + 底部选项卡默认显示", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)
  controller.runtime.todos.setItems([
    { id: "a", task: "任务 A", status: "in_progress" },
    { id: "b", task: "任务 B", status: "todo" },
  ])

  const { renderer, renderOnce, captureCharFrame } = await testRender(() => <App controller={controller} />, { width: 100, height: 14 })
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("待办清单")
  expect(frame).toContain("任务 A")
  expect(frame).toContain("任务 B")
  expect(frame).toContain("待办")
  expect(frame).toContain("审查")

  runtime.store.close()
})

test("右侧面板：审查输出 Tab 显示最新审查报告", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)
  controller.runtime.todos.addReview("review", "## 审查报告\n发现 2 个问题")
  controller.cyclePanelTab()
  expect(controller.panelTab()).toBe("review")

  const { renderer, renderOnce, captureCharFrame } = await testRender(() => <App controller={controller} />, { width: 100, height: 14 })
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("审查输出")
  expect(frame).toContain("审查报告")

  runtime.store.close()
})

test("TuiController.cyclePanelTab 切换面板选项卡", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)
  expect(controller.panelTab()).toBe("todos")
  controller.cyclePanelTab()
  expect(controller.panelTab()).toBe("review")
  controller.cyclePanelTab()
  expect(controller.panelTab()).toBe("todos")
  runtime.store.close()
})

function startMockServer() {
  let calls = 0
  const server = http.createServer((req, res) => {
    req.resume()
    req.on("end", () => {
      calls++
      res.writeHead(200, { "content-type": "text/event-stream" })
      const sse = (d: unknown) => res.write(`data: ${JSON.stringify(d)}\n\n`)
      if (calls === 1) {
        // 首次请求返回 glob 工具调用 → 触发权限申请
        sse({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "glob" } })
        sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } })
        sse({ type: "content_block_stop", index: 0 })
        sse({ type: "message_delta", delta: { stop_reason: "tool_use" } })
        sse({ type: "message_stop" })
      } else {
        sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
        sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "done" } })
        sse({ type: "content_block_stop", index: 0 })
        sse({ type: "message_delta", delta: { stop_reason: "end_turn" } })
        sse({ type: "message_stop" })
      }
      res.end()
    })
  })
  return new Promise<{ port: number; close: () => void }>((resolve) => {
    server.listen(0, () => resolve({ port: (server.address() as { port: number }).port, close: () => server.close() }))
  })
}

async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil 超时")
    await new Promise((r) => setTimeout(r, 10))
  }
}

test("权限申请：agent busy 等待时主输入框应答 y 放行", async () => {
  const mock = await startMockServer()
  const mockConfig: Config = {
    ...config,
    model: "mock/claude-sonnet-4-5",
    provider: { mock: { type: "anthropic", base_url: `http://localhost:${mock.port}/v1`, api_key_env: "MOCK_KEY" } },
  }
  process.env.MOCK_KEY = "test-key"
  const runtime = await createRuntime({ config: mockConfig })
  const session = runtime.sessions.create({ cwd: "/tmp", model: "mock/claude-sonnet-4-5" })
  const controller = new TuiController(runtime, session)

  const task = controller.submit("看看这里有什么")
  await waitUntil(() => controller.out.parts().some((p) => ("text" in p ? p.text : "").includes("请求权限")))
  expect(controller.busy()).toBe(true)
  const prompt = controller.out.parts().map((p) => ("text" in p ? p.text : "")).join(" ")
  expect(prompt).toContain("[权限] 请求权限: glob")

  await controller.submit("y")
  await task

  const text = controller.out.parts().map((p) => ("text" in p ? p.text : "")).join(" ")
  expect(text).toContain("done")

  mock.close()
  delete process.env.MOCK_KEY
  runtime.store.close()
})
