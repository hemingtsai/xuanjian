# Lua 插件 API 参考（`x` 全局）

玄鉴在 Lua 环境中注入全局表 `x`，配置脚本与插件均可使用。所有 API 均为命名空间函数。

## Lua ↔ JS 互操作规则

- **标量**：`nil` / `boolean` / `number` / `string` 双向直通。
- **表 ↔ 对象**：Lua 表（数组风格 = JS 数组；键值风格 = JS 对象）双向转换。JS 对象无原型链。
- **函数 ↔ 函数**：双向可调用。
- **Promise**：JS Promise 注入 Lua 后为"Promise 对象"，Lua 侧用 `:await()` 阻塞等待，返回结果。Lua 侧 `Promise.create(fn)` 创建 Lua Promise，JS 侧 `await`。
- **异步约束（重要）**：Lua 不能在"从 JS 调用进 Lua 的回调"内部进行 `:await()`（跨 C 边界 yield 受限）。规则：
  1. 所有异步 API（`x.system.run`、`x.fs.*`、`x.lsp.*`、`x.http.*`、`x.prompt`）**返回 Promise**，由 JS 侧 await。
  2. 复杂异步流程用 `x.async.wrap(fn)` 包装成协程函数，内部可安全 `:await()`。
  3. hook 回调与工具 `call` 若需异步：返回 Promise（JS 侧 await），或内部经 `x.async.wrap` 包装。
- **错误**：Lua `error()` → JS 捕获为 `Error`（`message` 含 `lua-error:` 前缀）；JS 抛错注入 Lua 为错误对象。异步 API 的 Promise 在 Lua 侧 `:await()` 失败时抛 Lua 错误。

## 命名空间总览

```
x.log         日志
x.config      运行时配置
x.hooks       事件订阅
x.async       协程异步工具
x.tool        工具注册
x.provider    Provider 注册
x.agent       Agent 注册
x.command     斜杠命令注册
x.model       模型注册
x.lsp         LSP 查询
x.fs          文件系统
x.system      子进程
x.session     会话
x.state       持久化 KV
x.http        HTTP 请求
x.prompt      询问用户
x.ui          TUI / banner
x.review      审查流水线
x.goal        goal 长程模式
x.version / x.platform
```

---

## x.log

```lua
x.log.trace(message, ...)   -- 格式串风格, 同 Lua string.format 语义的简单 %s/%d
x.log.debug(message, ...)
x.log.info(message, ...)
x.log.warn(message, ...)
x.log.error(message, ...)
```

日志输出到 stderr，带级别前缀与颜色（`[玄鉴]`）。`XUANJIAN_LOG=debug` 环境变量打开 debug/trace。

## x.config

```lua
x.config.get(key)            -- -> value | nil    key 为点号路径, 如 "review.enabled"
x.config.get_all()           -- -> table          合并后的完整配置
x.config.set(key, value)     -- 写入 overrides 文件(持久化), 立即生效(内存)
```

- `get("provider")` 返回 provider 表（含内置+自定义）。
- `set` 支持任意 JSON 可序列化值；深层覆盖采用"整段替换"语义（点号路径的父级对象整体替换）。

## x.hooks

```lua
x.hooks.on(event, callback)      -- 订阅; callback 可为同步函数或返回 Promise 的函数
x.hooks.off(event, callback)     -- 退订; 需持有原 callback 引用
```

事件回调约定：
- 同步回调：返回 nil 即可；返回值（若非 nil）为 hook 的"响应值"（见各事件说明）。
- 异步回调：返回 Promise（`x.async.wrap` 或直接返回异步 API 的 Promise）。
- 抛错：log 该事件错误，不影响主线。

完整事件表见 docs/plugins.md。

## x.async

```lua
x.async.wrap(fn)          -- fn: function(...) -> 内部可 :await() 的协程函数; 返回包装后的函数(调用后返回 Promise)
x.async.sleep(ms)         -- -> Promise, :await() 后休眠 ms 毫秒
```

`wrap` 基于 wasmoon 协程 workaround：包装的函数可被 JS 或 Lua 调用，返回 Lua Promise，内部可自由 `:await()`。例：

```lua
local heavy = x.async.wrap(function()
  local r = x.system.run("sleep 1; echo hi"):await()
  return r.stdout
end)
x.tool.register { name = "slow", call = function() return heavy() end }
```

## x.tool

```lua
x.tool.register {                     -- 注册自定义工具(JS/Lua 工具统一注册表)
  name = "my_tool",                   -- string, 必须唯一, ^[a-z_][a-z0-9_]*$
  description = "...",                -- string, 给 LLM 看的描述
  parameters = {                      -- table, JSON Schema 对象(或 nil)
    type = "object",
    properties = { arg1 = { type = "string", description = "..." } },
    required = { "arg1" },
  },
  call = function(args) ... end,      -- 同步或返回 Promise; 返回 { output = "..." } 或字符串
  permission = { mode = "ask" },      -- 可选: 覆盖该工具权限
  hidden = false,                     -- 可选: 不进 LLM 工具列表, 仅 Lua 内部调用
}

x.tool.unregister(name)               -- 移除工具
x.tool.call(name, args)               -- Lua 内部调用工具(可调用 JS 工具), 返回 { output, title, ... }
```

- `call` 返回：字符串（作为 output）或 `{ output = string, title = string?, metadata = table? }`。
- `parameters` 缺省时默认 `{ type = "object", properties = {} }`。
- 工具执行结果以 `tool_result` 事件回填给 LLM。

## x.provider

```lua
x.provider.register {
  id = "my-gw",                       -- string, 全局唯一
  type = "openai-compatible",         -- 适配器类型: anthropic | openai | openai-responses | gemini | openai-compatible | bedrock | azure | copilot
  base_url = "https://...",           -- 必填(openai-compatible)
  api_key_env = "MY_KEY",             -- API key 环境变量名(或省略则无鉴权)
  default_model = "model-id",         -- 默认模型
  models = {                          -- 可选, 模型目录
    ["model-id"] = { name = "Name", context = 8192 },
  },
}
```

注册后 provider 立即可在 `xuanjian providers list` 与模型路由中使用。

## x.agent

```lua
x.agent.register {
  id = "backend",
  name = "Backend",                   -- 可选, 默认 id
  description = "...",                -- 可选
  model = "anthropic/claude-sonnet-4-5",  -- 可选, 默认主模型
  system_prompt = "...",              -- 可选, 覆盖默认
  tools = { "*" },                    -- 可选, 工具白名单
  subagent = false,                   -- 可选, true 仅供 task 工具调用
}

x.agent.unregister(id)
x.agent.get(id)                       -- -> table 或 nil
```

## x.command

```lua
x.command.register("name", fn)        -- REPL 中 /name 触发; fn(text) 接收命令后剩余参数
x.command.unregister("name")
```

## x.model

```lua
x.model.register("provider_id", "model_id", {
  name = "...", context = 8192,        -- name 可选
})
x.model.unregister("provider_id", "model_id")
```

## x.lsp

全部返回 Promise，`:await()` 使用。`pos` 为 `{ line = 0, character = 0 }`（0 基）。

```lua
x.lsp.get_symbols(file)                -- -> { name, kind, range, selectionRange }[]
x.lsp.definition(file, pos)            -- -> { uri, range }[]   定义位置(可空)
x.lsp.references(file, pos)            -- -> { uri, range }[]
x.lsp.hover(file, pos)                 -- -> string | nil       Markdown 内容
x.lsp.diagnostics(file)                -- -> { source?, code?, severity, message, range }[]
x.lsp.completion(file, pos)            -- -> string[]           建议标签
x.lsp.format(file)                     -- -> boolean            触发 format
```

- 自动按文件扩展名选择语言并惰性启动服务器。
- 服务器未配置/启动失败时返回空结果（不抛错），记录 warn 日志。

## x.fs

全部同步（基于 Bun 内置，事件循环无阻塞问题）。

```lua
x.fs.read(path)           -- -> string (不存在则 nil)
x.fs.write(path, content) -- 递归创建父目录
x.fs.append(path, content)
x.fs.exists(path)         -- -> boolean
x.fs.delete(path)         -- 递归删除
x.fs.glob(pattern)        -- -> string[]   相对路径, 如 "src/**/*.ts"
x.fs.stat(path)           -- -> { size, mtime, is_dir, is_file } | nil
x.fs.watch(path, cb)      -- 文件变更回调(相对目录/文件); 返回 stop() 函数
```

路径解析：相对路径相对于当前项目工作目录。

## x.system

```lua
x.system.run(cmd, opts?)  -- -> Promise<{ stdout, stderr, code }>
                          -- cmd: string 或 string[] (argv)
                          -- opts: { cwd?, env = {K=V}, timeout_ms?, input? }
```

- `cmd` 为 string 时经 shell 执行；为数组时直接 exec 不经过 shell。
- 默认超时 120s，超时 kill 并抛错。`code ~= 0` 不抛错，由调用方检查 `code`。
- 大输出截断至 64KB（`stdout`/`stderr`）。

## x.session

```lua
x.session.current()        -- -> { id, cwd, model, agent, title? } | nil
x.session.messages()       -- -> { role, content, tool_calls?, tool_call_id? }[]
x.session.send(text)       -- 向当前会话注入一条用户消息(触发 agent loop)
```

## x.state

插件持久化 KV，按插件隔离（存储键 `state:<plugin>:<key>`，sqlite）。

```lua
x.state.get(key)     -- -> value | nil
x.state.set(key, v)  -- 仅 JSON 可序列化值
x.state.delete(key)
```

## x.http

```lua
x.http.request {                -- -> Promise<{ status, headers, body }>
  url = "https://...",
  method = "GET",               -- GET | POST | PUT | DELETE | PATCH
  headers = { ["Content-Type"] = "application/json" },
  body = "..." | table,         -- table 自动 JSON 序列化
  timeout_ms = 30000,
}
```

body 为表时自动 JSON 编码并设 `Content-Type: application/json`。非 2xx 不抛错。

## x.prompt

```lua
x.prompt(question)  -- -> Promise<string>  询问用户, REPL 输入; 非交互模式返回 nil
```

## x.ui

```lua
x.ui.logo()        -- -> string   玄鉴 ASCII 字标(ANSI 彩色, 按终端尺寸自动降级)
x.ui.banner()      -- -> string   启动 banner(logo + 标题行)
x.ui.notify(level, message)  -- level: "info"|"warn"|"error"; REPL 顶部提示
```

## x.review

```lua
x.review.register {                       -- 注册自定义审查员
  name = "my-reviewer",
  model = "anthropic/claude-sonnet-4-5",
  description = "...",
  prompt = nil,                           -- 自定义提示词(占位 {{diff}} {{todo}})
  triggers = { "refactor" },
}

x.review.run { todo = "...", files? }     -- -> Promise<{
                                          --   results: { reviewer, passed, issues[{file,line,severity,description,suggestion}] }[],
                                          --   report: string,      -- Markdown 报告
                                          --   committed: bool, pushed: bool
                                          -- }>
```

## x.goal

```lua
x.goal.create { title, description?, milestones? }  -- -> goal id (string)
x.goal.current()          -- -> goal 表 | nil       当前活跃 goal
x.goal.add_task(goal_id, { title, description?, deps = {}, checkpoint? })
x.goal.complete(task_id)  -- 手动标记任务完成(跳过 verify)
x.goal.pause()            -- 暂停当前 goal
x.goal.abort(goal_id?)    -- 中止
x.goal.status(goal_id?)   -- -> { status, tasks = {...} }  状态与任务进度
```

goal 表结构见 docs/goal.md。

## x.version / x.platform

```lua
x.version()      -- -> string  如 "0.1.0"
x.platform()     -- -> string  "darwin" | "linux" | "win32" | ...
```

## 错误与调试

- 插件 `require` 失败或加载时抛错：玄鉴记录 error 日志并跳过该插件，不阻塞启动。
- 插件内未捕获错误：记录 `x.log.error`，涉及的工具调用返回错误给 LLM。
- 开发提示：`XUANJIAN_LOG=debug xuanjian` 打开 debug 日志；`x.log.debug` 可在插件内埋点。
