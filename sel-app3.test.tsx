import { test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createRuntime } from "./src/core/runtime"
import { TuiController } from "./src/tui/controller"
import { App } from "./src/tui/App"
import type { Config } from "./src/config/schema"
const config: Config = { default_agent: "build", theme: "dark", provider: {}, lsp: {}, permission: { default: "ask", allow: [], deny: [] }, agents: {}, review: {}, goal: {}, plugins: [] }
const names = ["anthropic","openai","google","xai","openrouter","azure","aws","github-copilot","cloudflare"]

test("select modal frame", async () => {
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: "/tmp" })
  const controller = new TuiController(runtime, session)
  controller.setModal({ kind: "select", title: "选择要连接的 provider", options: names.map((n) => ({ name: n, description: "x", value: n })), resolve: () => {} })
  const r = await testRender(() => <App controller={controller} />, { width: 60, height: 16 })
  await r.renderOnce()
  const frame = r.captureCharFrame()
  frame.split("\n").forEach((l, i) => console.log(String(i).padStart(2), JSON.stringify(l)))
  runtime.store.close()
})
