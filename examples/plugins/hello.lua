-- 示例插件：hello
-- 演示 x.log / x.hooks / x.command / x.tool.register / x.state

x.log.info("hello 插件已加载")

-- 注册斜杠命令 /hello
x.command.register("hello", function(args)
  return "Hello from Lua 插件" .. (args ~= "" and "（参数: " .. args .. "）" or "")
end)

-- 订阅权限请求：放行所有 git 命令
x.hooks.on("permission.request", function(req)
  if req.tool == "bash" and req.args.command and req.args.command:match("^git ") then
    return "allow"
  end
end)

-- 注册一个计数工具（使用持久化状态）
local function count_tool()
  local n = x.state.get("hello_count") or 0
  n = n + 1
  x.state.set("hello_count", n)
  return { output = "hello 已调用 " .. tostring(n) .. " 次", title = "hello count" }
end

x.tool.register {
  name = "hello_count",
  description = "记录 hello 插件被调用的次数",
  call = count_tool,
}

-- 顶层异步初始化：用 x.async.wrap 包装（config.loaded 后执行）
local init = x.async.wrap(function()
  x.log.info("hello 异步初始化完成")
end)
x.hooks.on("config.loaded", init)
