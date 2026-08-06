# LSP 集成

玄鉴通过 stdio JSON-RPC 客户端对接语言服务器（LSP），把编辑器级语义带给 agent：定义跳转、引用、符号、hover、诊断，既是工具也是编辑后的反馈。

## 架构

```
tools/lsp.ts (lsp_* 工具)  ──┐
lua/api/lsp.ts (x.lsp.*)   ──┼──→ lsp/features.ts ──→ lsp/manager.ts ──→ lsp/client.ts ──(stdio JSON-RPC)──→ 语言服务器
goal/verify.ts (lsp 验证)  ──┘                              │
lsp/diagnostics.ts (诊断缓存) ←── publishDiagnostics ───────┘
```

- **`lsp/client.ts`**：stdio JSON-RPC。`send(method, params) → Promise<result>`（按 id 匹配响应）、`notify(method, params)`、服务器推送的 notification 派发给订阅者。
- **`lsp/manager.ts`**：文件 → 语言 → 服务器映射；惰性启动（首次需要时 spawn）；崩溃自动重启（指数退避，最多 3 次）；`shutdown` 优雅退出。
- **`lsp/servers.ts`**：内置语言 → 启动命令默认值。
- **`lsp/features.ts`**：封装 `textDocument/definition | references | documentSymbol | hover | completion | codeAction | rename | formatting`。
- **`lsp/diagnostics.ts`**：`publishDiagnostics` 缓存，编辑后可查询/推送 `lsp.diagnostic` 事件。

## 语言服务器默认映射（`servers.ts`）

| 语言 | 命令 |
|---|---|
| `typescript` / `typescriptreact` | `typescript-language-server --stdio` |
| `javascript` / `javascriptreact` | `typescript-language-server --stdio` |
| `python` | `basedpyright-langserver --stdio` |
| `go` | `gopls` |
| `rust` | `rust-analyzer` |
| `lua` | `lua-language-server` |
| `json` | `vscode-json-languageserver --stdio` |
| `yaml` | `yaml-language-server --stdio` |
| `markdown` | `markdown-language-server --stdio` |

命令缺失时该语言 LSP 功能自动禁用（工具返回空，不报错）。可在 `~/.config/xuanjian/xuanjian.lua` 覆盖：

```lua
lsp = {
  typescript = { command = "typescript-language-server", args = { "--stdio" } },
  lua = { disabled = true },
}
```

## LSP 工具

| 工具 | 说明 | 参数 |
|---|---|---|
| `lsp_definition` | 符号定义位置 | `{ file, line, character }` |
| `lsp_symbols` | 文件文档符号树 | `{ file }` |
| `lsp_references` | 符号引用 | `{ file, line, character }` |
| `lsp_diagnostics` | 文件诊断 | `{ file }` |
| `lsp_hover` | hover 文档 | `{ file, line, character }` |

返回结果为精简文本（含文件:行:列），供 LLM 阅读。位置 0 基，`line`/`character` 为整数。

## 编辑后反馈

- `write`/`edit` 工具完成后，自动触发 `textDocument/didSave` 并查询诊断。
- 存在 error 级诊断时，agent loop 将诊断作为上下文注入下一条模型请求，并记录 `lsp.diagnostic` 事件。
- goal 模式 `verify` 中的 `"lsp"` 项即检查该文件诊断无 error。

## 生命周期

- 服务器按需启动；无引用后不强制关闭（进程内缓存，会话结束统一 shutdown）。
- 崩溃自动重启，连续失败 3 次后禁用该语言 LSP 并 warn。
- `xuanjian lsp debug` 打印映射、运行状态、诊断计数。

## 调试

- `XUANJIAN_LOG=debug` 输出 JSON-RPC 收发日志。
- 服务器 stderr 透传至玄鉴日志（`lsp:<lang>` 前缀）。
