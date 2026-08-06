# 开发指南 Development

## 环境

- Bun ≥ 1.3（`packageManager` 声明在 package.json）
- macOS / Linux（Windows 部分支持，LSP 与 shell 工具受限）

```bash
bun install
```

## 常用命令

```bash
bun run dev                       # 开发运行（REPL）
bun run -- src/index.ts run "..." # 非交互
bun test                          # 运行测试（bun:test）
bun run typecheck                 # tsc --noEmit
bunx oxlint                      # 若有 lint 配置
```

## 目录职责速查

| 目录 | 职责 |
|---|---|
| `src/cli` | 参数解析、REPL、run、banner、渲染 |
| `src/core` | agent/session/agent-loop/permission/events/context |
| `src/config` | 配置加载与 schema（Lua 驱动） |
| `src/llm` | 统一 LLM 接口 + 协议适配器 + provider 目录 |
| `src/lsp` | LSP 客户端/管理器/特性/诊断 |
| `src/tools` | 工具注册表与内置工具 |
| `src/goal` | goal 长程模式 |
| `src/review` | 审查流水线 |
| `src/lua` | wasmoon 引擎、x API 注入、插件加载器 |
| `src/storage` | bun:sqlite 持久化 |

详细模块职责与数据流见 docs/architecture.md。

## 编码约定

- **TypeScript strict**：`strict` + `noUncheckedIndexedAccess`。
- **无注释代码**（除非必要）：文档在 docs/，不散落在代码中。
- **类型优先**：`src/config/schema.ts`、`src/llm/llm.ts`（LLMEvent）、`src/tools/registry.ts`（ToolDef）为核心契约，改契约先改文档。
- 模块边界：`lua/api` 不反向依赖 `cli`；`tools/registry` 不依赖 `cli`。禁止循环依赖。
- 异步：所有 IO 返回 Promise；Lua 侧规则见 docs/lua-api.md。

## 文档即规格（Docs-as-Spec）

本仓库采用文档先行：`docs/*.md` 是权威规格，实现以文档为准。**改行为时必须同步改文档**。文档粒度：

| 文档 | 代码契约 |
|---|---|
| docs/architecture.md | LLMEvent、ToolDef、事件总线、配置合并 |
| docs/config.md | `~/.config/xuanjian.lua` schema |
| docs/lua-api.md | `x` 全局 API 签名 |
| docs/cli.md | 子命令/斜杠命令/flags/退出码 |
| docs/providers.md | 适配器类型、provider 目录 |
| docs/lsp.md | lsp 工具与生命周期 |
| docs/review.md | review 配置与结果结构 |
| docs/goal.md | goal/task 数据模型 |

## 测试

`test/` 下按模块组织（bun:test 内建）：

| 测试 | 内容 |
|---|---|
| `test/config.test.ts` | Lua 配置解析、overrides 合并、默认值 |
| `test/llm-protocol.test.ts` | 各协议 SSE/事件解析（fixture 录制流） |
| `test/lsp-client.test.ts` | 假语言服务器（进程）下的 JSON-RPC 收发 |
| `test/tools.test.ts` | 工具 schema 校验、权限引擎、编辑/补丁 |
| `test/plugin.test.ts` | wasmoon 引导、x API 注入、异步 wrap |
| `test/review.test.ts` | 调度/审查输出解析、报告格式 |
| `test/goal.test.ts` | DAG 推进、重试/预算、恢复 |

运行：`bun test`。LLM 相关测试使用录制 fixture，不依赖真实网络。

## 提交规范

Conventional Commits：`type(scope): subject`。type：`feat/fix/docs/chore/refactor/perf/test`；scope：`cli/config/llm/lsp/core/tools/review/goal/lua/storage/docs`。一功能一 commit，代码与对应文档更新同 commit。

## 版本与发布

- `xuanjian --version` 读取 package.json。
- 发布产物：`bun build src/index.ts --compile` 或打包到 `dist/`（bin 已声明）。
