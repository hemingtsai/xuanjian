import { test, expect, beforeAll, afterAll } from "bun:test"
import fs from "node:fs"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { loadConfig } from "../src/config/loader"
import { createRuntime } from "../src/core/runtime"
import { getLuaEngine } from "../src/lua/engine"

let dir: string
let configDir: string
let dataDir: string
const oldConfig = process.env.XDG_CONFIG_HOME
const oldData = process.env.XDG_DATA_HOME

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "xj-plugin-"))
  configDir = path.join(dir, "config")
  dataDir = path.join(dir, "data")
  fs.mkdirSync(path.join(configDir, "xuanjian.d", "plugins"), { recursive: true })
  process.env.XDG_CONFIG_HOME = configDir
  process.env.XDG_DATA_HOME = dataDir
})

afterAll(() => {
  if (oldConfig) process.env.XDG_CONFIG_HOME = oldConfig
  else delete process.env.XDG_CONFIG_HOME
  if (oldData) process.env.XDG_DATA_HOME = oldData
  else delete process.env.XDG_DATA_HOME
  rmSync(dir, { recursive: true, force: true })
})

test("config script registers tool + provider via x API, plugin loads", async () => {
  writeFileSync(
    path.join(configDir, "xuanjian.lua"),
    [
      `x.log.info("config loaded")`,
      `x.tool.register {`,
      `  name = "lua_echo",`,
      `  description = "回显参数",`,
      `  call = function(args) return { output = "echo:" .. tostring(args.text), title = "lua_echo" } end,`,
      `}`,
      `x.provider.register { id = "mygw", type = "openai-compatible", base_url = "https://x", default_model = "m1" }`,
      `x.model.register("mygw", "m1", { context = 8192 })`,
      `return { model = "mygw/m1", plugins = { "hello" } }`,
    ].join("\n"),
  )
  writeFileSync(
    path.join(configDir, "xuanjian.d", "plugins", "hello.lua"),
    [
      `x.command.register("hello", function() return "hi" end)`,
      `x.hooks.on("config.loaded", function(payload) x.log.info("hook fired") end)`,
      `x.tool.register { name = "plugin_tool", description = "插件工具", call = function() return "from-plugin" end }`,
    ].join("\n"),
  )

  const config = await loadConfig()
  expect(config.model).toBe("mygw/m1")

  const runtime = await createRuntime({ config })
  expect(config.provider["mygw"]?.base_url).toBe("https://x")
  expect(config.provider["mygw"]?.models?.["m1"]?.context).toBe(8192)
  // 配置脚本与插件注册的工具都应可用
  expect(runtime.registry.get("lua_echo")).toBeDefined()
  expect(runtime.registry.get("plugin_tool")).toBeDefined()

  const echo = await runtime.registry.get("lua_echo")!.call({ cwd: dir }, { text: "玄鉴" })
  expect(echo.output).toBe("echo:玄鉴")

  const pluginTool = await runtime.registry.get("plugin_tool")!.call({ cwd: dir }, {})
  expect(pluginTool.output).toContain("from-plugin")

  // 斜杠命令已注册
  const { getSlashHandler } = await import("../src/core/slash")
  expect(getSlashHandler("hello")).toBeDefined()

  runtime.store.close()
})

test("x.async.wrap works at top level (coroutine)", async () => {
  const engine = await getLuaEngine()
  await engine.doString(`
    local heavy = x.async.wrap(function()
      x.async.sleep(5):await()
      return "wrapped"
    end)
    x.__test_heavy = heavy
  `)
  const p = engine.global.get("x").__test_heavy()
  const result = await p
  expect(result).toBe("wrapped")
})

test("x.state persists through store", async () => {
  const runtime = await createRuntime()
  runtime.store.setState("state:test_key", JSON.stringify({ a: 1 }))
  expect(runtime.store.getState("state:test_key")).toBe('{"a":1}')
  runtime.store.close()
})
