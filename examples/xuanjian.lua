-- 示例配置：展示玄鉴配置与内置 x API 用法
x.log.info("加载玄鉴配置")

-- 配置即插件：在这里注册一个自定义工具
x.tool.register {
  name = "timestamp",
  description = "获取当前 Unix 时间戳",
  call = function()
    return { output = tostring(os.time()), title = "timestamp" }
  end,
}

return {
  model = "anthropic/claude-sonnet-4-5",
  default_agent = "build",
  theme = "dark",

  provider = {
    anthropic = { api_key_env = "ANTHROPIC_API_KEY" },
    openai = { api_key_env = "OPENAI_API_KEY" },
  },

  permission = {
    default = "ask",
    allow = { "read", "glob", "grep" },
    deny = {},
  },

  review = {
    enabled = true,
    reviewers = {
      {
        name = "security",
        model = "anthropic/claude-haiku-4-5",
        description = "专注安全漏洞与敏感信息",
        triggers = { "security", "auth", "token", "password" },
      },
    },
    auto_commit = false,
  },

  goal = {
    verification = { "test", "typecheck" },
    max_attempts = 3,
    max_steps = 50,
    checkpoint = "write",
    auto_review = true,
  },

  plugins = {
    "hello",
    { path = "/Users/hemingtsai/Projects/xuanjian/examples/plugins/review.lua" },
  },
}
