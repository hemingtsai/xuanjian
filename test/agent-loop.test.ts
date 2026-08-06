import { test, expect, afterAll } from "bun:test"
import http from "node:http"
import { loadConfig } from "../src/config/loader"
import { createRuntime } from "../src/core/runtime"
import { runAgentTurn } from "../src/core/agent-loop"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Config } from "../src/config/schema"

const dir = mkdtempSync(path.join(tmpdir(), "xj-e2e-"))

function startMockServer(model: string) {
  let calls = 0
  const server = http.createServer((req, res) => {
    req.resume()
    req.on("end", () => {
      calls++
      res.writeHead(200, { "content-type": "text/event-stream" })
      const sse = (d: unknown) => res.write(`data: ${JSON.stringify(d)}\n\n`)
      sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: `mock-response-${calls}` } })
      sse({ type: "content_block_stop", index: 0 })
      sse({ type: "message_delta", delta: { stop_reason: "end_turn" } })
      sse({ type: "message_stop" })
      res.end()
    })
  })
  return new Promise<{ port: number; count: () => number; close: () => void }>((resolve) => {
    server.listen(0, () => {
      resolve({
        port: (server.address() as { port: number }).port,
        count: () => calls,
        close: () => server.close(),
      })
    })
  })
}

let mock: { port: number; count: () => number; close: () => void }

test("agent loop: user → LLM → 持久化消息", async () => {
  mock = await startMockServer("mock")
  const configDir = path.join(dir, "config")
  const { mkdirSync } = await import("node:fs")
  mkdirSync(path.join(configDir, "xuanjian"), { recursive: true })
  writeFileSync(
    path.join(configDir, "xuanjian", "xuanjian.lua"),
    `return { model = "mock/claude-sonnet-4-5", provider = { mock = { type = "anthropic", base_url = "http://localhost:${mock.port}/v1", api_key_env = "MOCK_KEY" } } }`,
  )
  const oldConfig = process.env.XDG_CONFIG_HOME
  const oldData = process.env.XDG_DATA_HOME
  process.env.XDG_CONFIG_HOME = configDir
  process.env.XDG_DATA_HOME = path.join(dir, "data")

  const config: Config = await loadConfig()
  process.env.MOCK_KEY = "test-key"
  const runtime = await createRuntime({ config })
  const session = runtime.sessions.create({ cwd: dir, model: "mock/claude-sonnet-4-5" })

  const result = await runAgentTurn("你好", {
    session,
    config: runtime.config,
    registry: runtime.registry,
    permission: runtime.permission,
    model: "mock/claude-sonnet-4-5",
    sink: { done: () => {} },
  })

  expect(result.text).toBe("mock-response-1")
  const messages = session.messages()
  expect(messages.length).toBe(2)
  expect(messages[0]!.role).toBe("user")
  expect(messages[1]!.role).toBe("assistant")

  runtime.store.close()
  if (oldConfig) process.env.XDG_CONFIG_HOME = oldConfig
  else delete process.env.XDG_CONFIG_HOME
  if (oldData) process.env.XDG_DATA_HOME = oldData
  else delete process.env.XDG_DATA_HOME
})

afterAll(() => {
  mock?.close()
  rmSync(dir, { recursive: true, force: true })
})
