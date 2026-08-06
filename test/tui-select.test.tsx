import { test, expect } from "bun:test"
import { testRender } from "@opentui/solid"
import { createRuntime } from "../src/core/runtime"
import { TuiController } from "../src/tui/controller"
import { App } from "../src/tui/App"
import type { Config } from "../src/config/schema"

const config: Config = { default_agent: "build", theme: "dark", provider: {}, lsp: {}, permission: { default: "ask", allow: [], deny: [] }, agents: {}, review: {}, goal: {}, plugins: [] }

test("select modal renders provider list", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)
  controller.setModal({
    kind: "select",
    title: "选择要连接的 provider",
    options: [
      { name: "anthropic", description: "Claude 系列", value: "anthropic" },
      { name: "openai", description: "GPT 系列", value: "openai" },
    ],
    resolve: () => {},
  })
  const { renderer, renderOnce, captureCharFrame } = await testRender(() => <App controller={controller} />, { width: 60, height: 14 })
  await renderOnce()
  const frame = captureCharFrame()
  expect(frame).toContain("选择要连接的 provider")
  expect(frame).toContain("anthropic")
  runtime.store.close()
})
