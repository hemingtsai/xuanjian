# 配置 Config

配置文件为 `~/.config/xuanjian/xuanjian.lua`（可用 `xuanjian config path` 查看实际路径；支持 `XDG_CONFIG_HOME`）。

它是一个 **Lua 脚本**，**返回值即配置表**。加载顺序：

1. wasmoon 引导，注入 `x` 全局
2. 执行 `~/.config/xuanjian/xuanjian.lua`
3. 取脚本返回值作为配置
4. 与 `~/.config/xuanjian/overrides.lua`（`x.config.set` 自动生成）**浅层合并**
5. 缺失字段用默认值补齐

优先级：**overrides > 用户配置 > 默认值**。

辅助目录 `~/.config/xuanjian/`：`plugins/`（插件）、`overrides.lua`（运行时覆盖，自动生成）。

## 完整字段参考

```lua
return {
  -- 默认模型，格式 "provider/model"，如 "anthropic/claude-sonnet-4-5"
  model = "anthropic/claude-sonnet-4-5",

  -- 默认 agent id（内置 build / plan，也可自定义）
  default_agent = "build",

  -- UI 主题: "dark" | "light"
  theme = "dark",

  -- ============ provider ============
  -- 每个键: 内置 provider id 或自定义 id（自定义需 type）
  provider = {
    -- 内置 provider 可覆盖 base_url / api_key_env
    anthropic = { api_key_env = "ANTHROPIC_API_KEY" },
    openai    = { api_key_env = "OPENAI_API_KEY" },

    -- 自定义 OpenAI 兼容 provider（DeepSeek/Qwen/智谱/Ollama/vLLM...）
    deepseek = {
      type = "openai-compatible",
      base_url = "https://api.deepseek.com/v1",
      api_key_env = "DEEPSEEK_API_KEY",
      default_model = "deepseek-chat",
      models = {
        ["deepseek-chat"]     = { name = "DeepSeek V3",  context = 65536 },
        ["deepseek-reasoner"] = { name = "DeepSeek R1",  context = 65536 },
      },
    },
  },

  -- ============ lsp ============
  -- 键为语言 id，值覆盖或新增服务器启动命令
  lsp = {
    typescript = { command = "typescript-language-server", args = { "--stdio" } },
    python = { command = "basedpyright-langserver", args = { "--stdio" } },
    -- 可关闭: lua = { disabled = true }
  },

  -- ============ permission ============
  permission = {
    -- default: "ask" | "allow" | "deny"
    default = "ask",
    -- 按工具 id 或 "工具:参数前缀" 匹配
    allow = { "read", "glob", "grep", "bash:git status", "bash:git diff" },
    deny  = { "bash:rm -rf" },
  },

  -- ============ agents ============
  agents = {
    -- 自定义 agent
    backend = {
      name = "Backend",
      description = "后端开发专家",
      model = "anthropic/claude-sonnet-4-5",
      system_prompt = "你专注于 Go 后端开发...",
      tools = { "*" },            -- 工具白名单, "*" 全部
      subagent = false,           -- true 则仅供 task 工具调用
    },
    -- 覆盖内置 agent
    plan = { tools = { "read", "glob", "grep", "lsp_definition" } },
  },

  -- ============ review 审查流水线 ============
  review = {
    enabled = true,
    scheduler = {
      model = "anthropic/claude-haiku-4-5",   -- 轻量调度模型
      prompt = nil,                           -- 自定义调度提示词
    },
    reviewers = {
      {
        name = "security",
        model = "anthropic/claude-sonnet-4-5",
        description = "专注安全漏洞与敏感信息",
        prompt = nil,                         -- 自定义审查提示词
        triggers = { "security", "auth", "token", "password" },
      },
      {
        name = "code-quality",
        model = "anthropic/claude-sonnet-4-5",
        description = "代码质量、可维护性、最佳实践",
        triggers = { "refactor", "feature", "fix" },
      },
    },
    auto_commit = false,                      -- 通过审查后自动 commit
    auto_push = false,                        -- 需要 auto_commit
  },

  -- ============ goal 长程模式 ============
  goal = {
    verification = { "test", "typecheck", "lsp" },  -- verify 阶段执行项
    max_attempts = 3,                              -- 每任务最大重试
    max_steps = 100,                               -- 总步数上限
    max_tokens = 0,                                -- 0 = 不限
    checkpoint = "write",                          -- 破坏性操作前暂停确认
    auto_review = true,                            -- 里程碑完成自动审查
    plan_model = nil,                              -- 规划模型, 默认主模型
  },

  -- ============ plugins ============
  -- 字符串: 从 ~/.config/xuanjian/plugins/<name>.lua 加载
  -- 表:    { path = "/abs/path.lua" } 显式路径
  plugins = {
    "my-plugin",
    { path = "/Users/me/dev/xuanjian-plugins/my-tool.lua" },
  },
}
```

## 字段类型与默认值

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `model` | string | — | 默认模型 `provider/model` |
| `default_agent` | string | `"build"` | 默认 agent |
| `theme` | `"dark"\|"light"` | `"dark"` | 主题 |
| `provider` | table | 内置目录 | 见 docs/providers.md |
| `lsp` | table | 内置默认 | 覆盖/新增语言服务器 |
| `permission.default` | `"ask"\|"allow"\|"deny"` | `"ask"` | 默认权限 |
| `permission.allow` | string[] | `[]` | 允许列表 |
| `permission.deny` | string[] | `[]` | 拒绝列表 |
| `agents` | table | `{build, plan}` | 自定义/覆盖 agent |
| `review.enabled` | boolean | `true` | 启用审查流水线 |
| `review.scheduler.model` | string | 主模型 | 调度模型 |
| `review.reviewers` | array | 内置 reviewers | 审查员配置 |
| `review.auto_commit` | boolean | `false` | 自动提交 |
| `review.auto_push` | boolean | `false` | 自动推送 |
| `goal.verification` | string[] | `["test","typecheck","lsp"]` | 验证项 |
| `goal.max_attempts` | number | `3` | 重试上限 |
| `goal.max_steps` | number | `100` | 步数上限 |
| `goal.checkpoint` | `"write"\|nil` | `"write"` | checkpoint 策略 |
| `goal.auto_review` | boolean | `true` | 里程碑自动审查 |
| `plugins` | array | `[]` | 插件列表 |

## 配置中的 x 全局

配置脚本执行时已注入 `x` 全局，因此配置里可以：

```lua
x.log.info("loading config")
x.tool.register { ... }      -- 配置即插件：可注册工具
return { model = "openai/gpt-5.2", ... }
```

## 子命令

| 命令 | 说明 |
|---|---|
| `xuanjian config init` | 生成默认配置文件模板 |
| `xuanjian config path` | 打印配置路径 |
| `xuanjian config get <key>` | 读取配置（点号路径如 `review.enabled`） |
| `xuanjian config set <key> <value>` | 写入 overrides（`~/.config/xuanjian/overrides.lua`） |

## 运行时覆盖

Lua API `x.config.set(key, value)` 会写入 overrides 文件（Lua 表格式，自动生成），供下次启动合并。CLI 的 `config set` 与 Lua API 共用同一机制。
