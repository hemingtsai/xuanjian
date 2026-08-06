# Provider 与模型

玄鉴通过**自研协议适配器**对接各家 LLM，覆盖市面上主流 provider，并支持任意 OpenAI 兼容服务。

## 适配器类型（`llm/protocol/`）

| 类型 | 协议 | 流式 | 备注 |
|---|---|---|---|
| `anthropic` | Anthropic Messages API | SSE | tool_use / input_json_delta |
| `anthropic-compatible` | 同 `anthropic` | SSE | 任意 Anthropic 兼容端点（代理/网关） |
| `openai` | OpenAI Chat Completions | SSE | `chat.completion.chunk` |
| `openai-responses` | OpenAI Responses API | SSE | `response.output_text.delta` / function_call |
| `gemini` | Google Gemini | SSE | `generateContent` stream |
| `openai-compatible` | 同 `openai` | SSE | 任意兼容端点 |
| `azure` | Azure OpenAI (chat/responses) | SSE | 按配置选择 |
| `bedrock` | Amazon Bedrock Converse | 事件流 | |
| `copilot` | GitHub Copilot Gateway | SSE | chat/responses |

**统一接口**：`LLM.complete(params) → AsyncIterable<LLMEvent>`，各适配器将自身事件归一化（见 docs/architecture.md 的 LLMEvent 契约）。

## 内置 Provider 目录（`llm/providers.ts`）

| id | 适配器 | 默认模型示例 |
|---|---|---|
| `anthropic` | anthropic | `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5` |
| `openai` | openai / openai-responses | `gpt-5.2`, `gpt-5-mini` |
| `google` | gemini | `gemini-2.5-flash`, `gemini-2.5-pro` |
| `xai` | openai-responses | `grok-4`, `grok-4-fast` |
| `openrouter` | openai / openai-responses | `anthropic/claude-sonnet-4-5` 等聚合 |
| `deepseek` | openai-compatible | `deepseek-chat` (V3), `deepseek-reasoner` (R1) |
| `qwen` | openai-compatible | `qwen3-coder-plus`, `qwen3-plus`（阿里百炼） |
| `zhipu` | openai-compatible | `glm-4-plus`, `glm-4-flash`（智谱） |
| `moonshot` | openai-compatible | `kimi-k2`, `kimi-latest`（月之暗面） |
| `minimax` | openai-compatible | `MiniMax-Text-01` |
| `siliconflow` | openai-compatible | `deepseek-ai/DeepSeek-V3` 等（硅基流动） |
| `ollama` | openai-compatible | `qwen2.5-coder:14b` 等（本地，无需 key） |
| `azure` | azure | 按部署名 |
| `aws` | bedrock | `anthropic.claude-sonnet-4-5` 等 |
| `github-copilot` | copilot | 随订阅 |
| `cloudflare` | openai-compatible | Workers AI 模型 |

模型 ID 路由格式：`<provider>/<model>`，如 `anthropic/claude-sonnet-4-5`、`deepseek/deepseek-chat`。

## 鉴权

优先使用 `provider.<id>.api_key_env` 指定的环境变量；未指定则按 provider 默认环境变量读取：

| provider | 默认环境变量 |
|---|---|
| anthropic | `ANTHROPIC_API_KEY` |
| openai | `OPENAI_API_KEY` |
| google | `GEMINI_API_KEY` 或 `GOOGLE_API_KEY` |
| xai | `XAI_API_KEY` |
| openrouter | `OPENROUTER_API_KEY` |
| deepseek | `DEEPSEEK_API_KEY` |
| qwen | `DASHSCOPE_API_KEY` |
| zhipu | `ZHIPU_API_KEY` |
| moonshot | `MOONSHOT_API_KEY` |
| minimax | `MINIMAX_API_KEY` |
| siliconflow | `SILICONFLOW_API_KEY` |
| ollama | —（本地无需 key） |
| azure | `AZURE_API_KEY` + `AZURE_RESOURCE_NAME` + `AZURE_API_VERSION` |
| aws | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`（或凭证链） |
| github-copilot | Copilot 会话令牌（自动） |
| cloudflare | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` |

## 接入 OpenAI 兼容服务

任何兼容 Chat Completions 的服务（DeepSeek、Moonshot、通义千问、智谱、MiniMax、硅基流动、Groq、Mistral、Together、Ollama、LM Studio、vLLM、TensorRT-LLM…）都可在 `~/.config/xuanjian/xuanjian.lua` 声明：

```lua
provider = {
  deepseek = {
    type = "openai-compatible",
    base_url = "https://api.deepseek.com/v1",
    api_key_env = "DEEPSEEK_API_KEY",
    default_model = "deepseek-chat",
    models = {
      ["deepseek-chat"]     = { name = "DeepSeek V3", context = 65536 },
      ["deepseek-reasoner"] = { name = "DeepSeek R1", context = 65536 },
    },
  },
}
```

之后即可 `xuanjian run -m deepseek/deepseek-chat "..."`。`deepseek`、`qwen`、`zhipu`、`moonshot`、`minimax`、`siliconflow`、`ollama` 已内置，仅需设置对应 API key 即可直接使用。

## 接入 Anthropic 兼容服务

任何兼容 Anthropic Messages API 的端点（自建网关、代理、Claude Code Router 等）用 `type = "anthropic-compatible"`：

```lua
provider = {
  mygateway = {
    type = "anthropic-compatible",
    base_url = "https://my-gateway.example.com/v1",   -- 走 Anthropic 协议
    api_key_env = "MY_GATEWAY_KEY",
    default_model = "claude-sonnet-4-5",
  },
}
```

之后即可 `xuanjian run -m mygateway/claude-sonnet-4-5 "..."`。

## 本地模型（Ollama / LM Studio）

```lua
provider = {
  ollama = {
    type = "openai-compatible",
    base_url = "http://localhost:11434/v1",   -- 无需 api_key_env
    default_model = "qwen2.5-coder:14b",
    models = { ["qwen2.5-coder:14b"] = { context = 32768 } },
  },
}
```

## 运行时

- `xuanjian providers list` / `xuanjian providers list <id>` 查询目录。
- `x.model.register(provider_id, model_id, info)` Lua 注册模型。
- `x.provider.register{...}` Lua 注册 provider（同配置声明）。
- `--model` / REPL `/model` 切换。

## 工具调用说明

适配器需支持工具调用（function calling / tool use）。各家 tool-call 流式事件归一化为统一 `tool_call` 事件；不支持工具调用的模型仍可对话（工具调用能力降级为无）。

## 失败与重试

- 网络/认证错误：`LLMEvent {type:"error"}`，agent loop 记录并提示用户检查 API key。
- 流式中断：SDK 层自动重试 1 次（幂等请求），仍失败则报错。
