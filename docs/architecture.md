# 架构 Architecture

玄鉴的整体架构：Bun + TypeScript 运行时，Lua（wasmoon）负责配置与插件，自研 LLM 协议适配器对接各 Provider，LSP 通过 stdio JSON-RPC 客户端接入语言服务器。

## 模块总览

```
src/
├── index.ts              # CLI 入口：参数解析、命令分发
├── cli/
│   ├── banner.ts         # 书法风 XUANJIAN logo + go mini logo + 小终端降级
│   ├── run.ts            # 非交互模式 xuanjian run
│   ├── render.ts         # 非交互流式渲染（run 模式）
│   ├── doctor.ts         # 环境检查
│   └── args.ts           # 参数解析
├── tui/
│   ├── App.tsx           # TUI 根组件：scrollbox 输出 + modal + 输入框 + 状态栏
│   ├── controller.ts     # TuiController：会话/agent 循环接线、历史、modal 管理
│   ├── parts.ts          # 输出部分类型 + LoopSink 桥接（流式 push 到 signal）
│   ├── status.ts         # 状态栏构建（model/agent/模式/工作区/LSP/DAP/ctx）
│   └── index.tsx         # runTui 入口：runtime 接线 + 斜杠命令 + 渲染
├── dap/status.ts         # DAP 状态位（StatusProvider 预留）
├── core/
│   ├── agent.ts          # agent 注册表与解析（build/plan/自定义）
│   ├── session.ts        # 会话生命周期与消息持久化
│   ├── agent-loop.ts     # 主代理循环：消息组装→LLM→工具→回填
│   ├── permission.ts     # 权限引擎 allow/deny/ask + 通配符
│   ├── events.ts         # 类型化事件总线（JS 侧，Lua hooks 由 lua/api/hooks 桥接）
│   └── context.ts        # 项目上下文组装与上下文压缩
├── config/
│   ├── loader.ts         # 用 wasmoon 执行 ~/.config/xuanjian/xuanjian.lua，合并 overrides
│   ├── schema.ts         # TS 类型：Config / ProviderConfig / LspConfig / ...
│   └── defaults.ts       # 默认配置
├── llm/
│   ├── llm.ts            # 统一接口 LLM.complete() + 模型路由 + 工具调用归一化
│   ├── protocol/
│   │   ├── index.ts      # 适配器接口 Adapter
│   │   ├── anthropic-messages.ts
│   │   ├── openai-chat.ts
│   │   ├── openai-responses.ts
│   │   ├── gemini.ts
│   │   ├── openai-compatible.ts
│   │   ├── bedrock-converse.ts
│   │   ├── azure.ts
│   │   └── copilot.ts
│   └── providers.ts      # 内置 provider 目录 + profile（openai-compatible）
├── lsp/
│   ├── manager.ts        # 文件→语言→服务器映射，惰性 spawn，崩溃重启
│   ├── client.ts         # stdio JSON-RPC 客户端
│   ├── servers.ts        # 语言→服务器默认配置
│   ├── features.ts       # definition/references/documentSymbol/hover/codeAction/rename
│   └── diagnostics.ts    # publishDiagnostics 缓存
├── tools/
│   ├── registry.ts       # 工具注册表（JS 工具 + Lua 工具统一）
│   ├── schema.ts         # zod → JSON Schema
│   ├── read.ts write.ts edit.ts apply_patch.ts
│   ├── glob.ts grep.ts bash.ts todo.ts
│   ├── webfetch.ts question.ts task.ts
│   └── lsp.ts            # lsp_definition/lsp_symbols/lsp_references/lsp_diagnostics
├── goal/
│   ├── goal.ts           # goal/task 数据模型 + sqlite 持久化
│   ├── planner.ts        # 规划子代理 → 任务 DAG
│   ├── loop.ts           # plan→act→verify→review 闭环 + 重试/checkpoint/预算
│   ├── verify.ts         # 测试/typecheck/LSP 诊断验证
│   └── report.ts         # 目标报告生成
├── review/
│   ├── pipeline.ts       # 审查流水线：diff→调度→并发审查→提交
│   ├── scheduler.ts      # LLM 调度派发 reviewer
│   ├── reviewer.ts       # 单 reviewer + 结构化输出解析
│   ├── diff.ts           # git diff 采集
│   ├── commit.ts         # 自动 commit/push + 消息生成
│   └── report.ts         # 分级 Markdown 报告
├── lua/
│   ├── engine.ts         # wasmoon 引导、x 全局注入、Lua↔JS 互操作
│   ├── loader.ts         # 插件发现 + require 解析
│   └── api/              # 每个命名空间一个文件，注入 x 全局
└── storage/
    └── db.ts             # bun:sqlite：sessions/messages/goals/tasks/state/overrides
```

## 依赖方向

```
index.ts → cli → core → { config, llm, lsp, tools, goal, review, lua, storage }
index.ts → tui → { core, cli/banner, goal, review }
```

- 上层调用下层；`lua/api` 依赖所有子系统（把 JS 能力暴露给 Lua）
- `core/events.ts` 与 `lua/api/hooks.ts`：JS 事件总线触发 Lua 回调；Lua 回调返回 Promise 时 JS 侧 await
- 禁止循环依赖：`lua/api` 不反向依赖 cli；`tools/registry` 不依赖 cli
- **TUI（tui/）**：基于 @opentui/core + @opentui/solid（opencode 同款栈）。`controller.ts` 持会话与输出 signal；`parts.ts` 把 agent 的 `LoopSink` 流式写入 signal；`App.tsx` 响应式渲染 scrollbox/输入/状态栏；`useKeyboard` 处理全局键位

## 三大闭环数据流

### 1. agent 闭环（`core/agent-loop.ts`）

```
用户消息 → [组装消息: system + 历史 + 上下文] → LLM.complete(流式)
  → text → 渲染
  → tool_call → 权限门 → 执行工具(JS 或 Lua) → 结果回填 → 继续循环
  → 上下文超限时压缩(truncate) → 直到最终答复
```

### 2. 审查闭环（`review/pipeline.ts`）

```
trigger(任务完成/review 命令) → 收集 git diff
  → scheduler(轻量模型) 按 triggers 派发 reviewer 名单
  → 并发运行 reviewer(结构化 {passed, issues[]})
  → 报告生成 → (可选) critical==0 时自动 commit/push
```

### 3. goal 闭环（`goal/loop.ts`）

```
goal 定义 → planner(只读) 产出任务 DAG(依赖+里程碑)
  → 逐任务: plan(只读) → act(写,权限门) → verify(测试/typecheck/lsp)
  → 里程碑触发 review 审查, critical 阻断返工
  → 重试 ≤ max_attempts, 超限 → blocked → paused 等用户
  → 全部 done → 最终审查 → 目标报告; 状态持久化可 resume
```

## 关键类型契约

### LLM 统一接口（`llm/llm.ts`）

```ts
interface LLMEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; output: string }   // 回填到模型
  | { type: "error"; message: string }
  | { type: "done" }

LLM.complete(params): AsyncIterable<LLMEvent>
// params: { model, system, messages, tools?: ToolDef[], abort? }
// messages: { role: "user"|"assistant"|"tool"; content: string; toolCalls?; toolCallId? }
```

适配器把各家流式事件（Anthropic SSE / OpenAI chunk / Gemini …）归一化为上述事件。

### 工具定义（`tools/registry.ts`）

```ts
interface ToolDef {
  id: string
  description: string
  parameters: JSONSchema7        // zod → JSON Schema
  call(ctx: ToolContext, args: Record<string, unknown>): Promise<ExecuteResult>
}
interface ToolContext { sessionID, messageID, agent, abort, ask(permission), extra }
interface ExecuteResult { title: string; output: string; metadata? }
```

### 事件总线（`core/events.ts`）

事件名统一小写点号分隔：`session.start`、`tool.before_call`、`permission.request`、`review.completed`、`goal.task.done` 等。完整清单见 `docs/lua-api.md`（hooks 事件表）。JS 侧用 `Events.on/emit`；Lua 侧用 `x.hooks.on`。

### 配置合并（`config/loader.ts`）

```
~/.config/xuanjian/xuanjian.lua 返回值(Config)  ← 权威
  ⊕ ~/.config/xuanjian/overrides.lua (x.config.set 自动生成, 浅层覆盖)
  ⊕ 默认值(defaults.ts)
优先级: overrides > 用户配置 > 默认
```
