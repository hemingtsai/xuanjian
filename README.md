# 玄鉴 Xuanjian

> AI 编程 agent · LSP 集成 · 多 Provider · Lua 插件与配置 · 审查流水线 · goal 长程自主模式

玄鉴（Xuanjian）是一个从零构建的 AI 编程 agent。"玄鉴"取义"深察明镜、审鉴万物"——它不仅能写代码，更能在每个里程碑用自动审查流水线审视自己的成果，并在 goal 模式下长程自主地完成复杂目标。

```
 __  __                  _ _
 \ \/ /   _  __ _ _ __  (_|_) __ _ _ __
  \  / | | |/ _` | '_ \ | | |/ _` | '_ \
  /  \ |_| | (_| | | | || | | (_| | | | |
 /_/\_\__,_|\__,_|_| |_|/ |_|\__,_|_| |_|
                      |__/
```

## 特性

- **LSP 深度集成**：definition / references / documentSymbol / hover / diagnostics，作为 agent 工具与编辑后反馈
- **全屏 TUI**：opencode 同款 @opentui 栈，底部持久状态栏（模型/agent/模式/工作区/LSP/DAP/上下文），GitHub 风格 diff 展示，流式滚动输出
- **多 Provider**：Anthropic、OpenAI（Chat+Responses）、Gemini、xAI、OpenRouter、Azure、Bedrock、Copilot、Cloudflare + 任意 OpenAI 兼容服务（DeepSeek / Qwen / 智谱 / Ollama …）
- **Lua 插件系统**：`~/.config/xuanjian/xuanjian.lua` 即配置，插件用 Lua 编写，暴露完整 `x` API（见 `docs/lua-api.md`）
- **审查流水线**（"鉴"）：调度器派发多 review，结构化审查 git diff，自动 commit/push
- **goal 长程模式**：目标 → 任务 DAG → plan/act/verify/review 闭环 → 断点续跑
- **权限引擎**：allow / deny / ask，通配符与 Lua hook 拦截
- **会话持久化**：bun:sqlite 存储会话、消息、goal、插件状态

## 快速开始

```bash
bun install
bun run dev                    # 进入全屏 TUI（未连接 provider 时显示 onboarding 引导）
bun run -- src/index.ts run "把 README 翻译成英文"
bun run -- src/index.ts auth login          # 连接 provider 交互向导
bun run -- src/index.ts config init
bun run -- src/index.ts review "完成了登录鉴权模块"
bun run -- src/index.ts run --goal "构建一个可部署的博客系统"
```

## 文档导航

| 文档 | 内容 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 架构、模块职责、三大闭环数据流 |
| [docs/config.md](docs/config.md) | 配置格式 `~/.config/xuanjian/xuanjian.lua` 全参考 |
| [docs/cli.md](docs/cli.md) | 子命令 / 斜杠命令 / flags |
| [docs/lua-api.md](docs/lua-api.md) | Lua 插件 API（`x` 全局）全量参考 |
| [docs/plugins.md](docs/plugins.md) | 插件开发指南与 hooks 事件表 |
| [docs/providers.md](docs/providers.md) | Provider 清单与接入教程 |
| [docs/lsp.md](docs/lsp.md) | LSP 架构与工具 |
| [docs/review.md](docs/review.md) | 审查流水线 |
| [docs/goal.md](docs/goal.md) | goal 长程模式 |
| [docs/development.md](docs/development.md) | 构建 / 测试 / 贡献 |

## 实施进度

- [x] 阶段 0：脚手架
- [x] 阶段 1：文档（README / architecture / config / cli / lua-api / plugins / providers / lsp / review / goal / development）
- [x] 阶段 2：全部功能（CLI、配置、LLM 多 Provider、agent loop、工具、权限、LSP、审查流水线、goal 长程模式、Lua 插件系统、doctor）

```bash
bun test        # 22 个测试
bun run typecheck
```

## License

MIT © Hemingtsai
