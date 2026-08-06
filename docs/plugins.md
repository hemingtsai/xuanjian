# 插件开发指南 Plugins

插件用 Lua 编写，通过 `~/.config/xuanjian.lua` 的 `plugins` 字段加载。API 全量参考见 docs/lua-api.md。

## 目录约定

| 来源 | 路径 | 配置方式 |
|---|---|---|
| 用户插件 | `~/.config/xuanjian.d/plugins/<name>.lua` | `plugins = { "name" }` |
| 显式路径 | 任意绝对路径 | `plugins = { { path = "/abs/plugin.lua" } }` |
| 项目本地 | `<cwd>/.xuanjian/plugins/<name>.lua` | 自动发现（可选） |

插件内可 `require("<other-plugin>")` 依赖其他插件（仅限插件目录内，`.lua` 后缀可省略）。

## 最小插件

```lua
-- ~/.config/xuanjian.d/plugins/hello.lua
x.log.info("hello plugin loaded")
```

## 注册工具

```lua
-- 一个返回当前时间戳的工具
x.tool.register {
  name = "timestamp",
  description = "获取当前 Unix 时间戳",
  parameters = {
    type = "object",
    properties = {},
    required = {},
  },
  call = function()
    return { output = tostring(os.time()) }
  end,
}
```

异步工具（内部 `:await()`）：

```lua
x.tool.register {
  name = "repo_health",
  description = "运行 git status 并返回结果",
  call = x.async.wrap(function()
    local r = x.system.run("git status --short"):await()
    return { output = r.stdout, title = "git status" }
  end),
}
```

## 拦截权限（hook）

```lua
x.hooks.on("permission.request", function(req)
  if req.tool == "bash" and req.args.command and req.args.command:match("^git ") then
    return "allow"          -- 返回 "allow"/"deny" 覆盖决策
  end
end)
```

## 全部 hooks 事件表

回调载荷为 table（字段见下）。返回"响应值"的事件已标注。

| 事件 | 载荷 | 响应值 |
|---|---|---|
| `session.start` | `{ session_id, cwd }` | — |
| `session.end` | `{ session_id }` | — |
| `message.user` | `{ text }` | — |
| `message.assistant` | `{ text, parts }` | — |
| `tool.before_call` | `{ tool, args, session_id, message_id }` | `{ abort = true }` 或 `{ args = {...} }`（改写参数） |
| `tool.after_call` | `{ tool, args, result }` | — |
| `permission.request` | `{ tool, args, mode }` | `"allow"` / `"deny"` |
| `agent.selected` | `{ agent }` | — |
| `config.loaded` | `{ config }` | — |
| `lsp.diagnostic` | `{ file, diagnostics }` | — |
| `review.completed` | `{ results, report, committed, pushed }` | — |
| `goal.started` | `{ goal }` | — |
| `goal.task.done` | `{ goal_id, task }` | — |
| `goal.milestone.review` | `{ goal_id, task, review }` | — |
| `goal.blocked` | `{ goal_id, task, reason }` | — |
| `goal.done` | `{ goal_id, report }` | — |

响应值约定：若回调返回非 nil，玄鉴按上表解释；其余事件返回值忽略。

## 异步约束（必读）

1. **回调内禁止裸 `:await()`**（wasmoon 跨 C 边界 yield 限制）。需要异步时：
   - 简单场景：直接返回 Promise。例：`x.hooks.on("tool.before_call", function() return x.system.run("...") end)` — 玄鉴会 await 该 Promise。
   - 复杂流程：`x.async.wrap(function() ... :await() ... end)`。
2. **`x.async.wrap` 必须在"顶层上下文"调用**（插件文件顶层、配置脚本顶层、`doString` 顶层）。不要在 JS→Lua 回调（hook 回调、工具 `call` 函数）内部调用 `x.async.wrap(...)`——那会运行在不可 yield 的主线程上，协程会失败。正确做法是顶层创建、回调内复用：

```lua
-- 顶层创建
local heavy = x.async.wrap(function()
  local r = x.system.run("git status"):await()
  return r.stdout
end)
-- 工具 call 里复用（只是返回 Promise，不 yield）
x.tool.register { name = "git_status", call = function() return heavy() end }
```

3. **工具 `call` 同理**：同步返回或返回 Promise，或经顶层创建的 `x.async.wrap` 包装。
4. 顶层异步初始化：用 `x.async.wrap` 包装后在 `config.loaded` hook 中调用（hook 仅调用已包装的函数，内部可 `:await()`）。

## 持久化状态

```lua
x.state.set("count", (x.state.get("count") or 0) + 1)
x.state.get("count")
```

## 自定义斜杠命令

```lua
x.command.register("hello", function(args)
  return "Hello from plugin, args=" .. args
end)
```

## 错误处理

- 加载抛错 → 该插件被跳过，`x.log.error` 记录，玄鉴正常启动。
- 运行时抛错 → 记录日志；工具调用错误会作为 tool_result 反馈给 LLM 以便其修正。
- 建议插件内 `pcall` 包裹高风险调用。
