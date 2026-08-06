# 审查流水线 Review

玄鉴之名取"鉴"字之义：对每一份成果深察审视。审查流水线是玄鉴的一级特性，源于自动审查设计，以独立子系统实现（`src/review/`）。

## 流程

```
触发(任务完成 / review 命令 / goal 里程碑)
  → 收集 git diff (工作区 vs HEAD, context=3)
  → scheduler(轻量模型) 依据 reviewers[].triggers + todo + 变更文件, 派发审查员名单(JSON 数组)
  → 并发运行选中的 reviewer
      每个 reviewer: 拿到 {diff, todo} + 自身 prompt → LLM → 结构化 JSON
  → 汇总 report (Markdown, 分级图标)
  → auto_commit: critical==0 时 LLM 生成 conventional commit message → add/commit
  → auto_push: 需 auto_commit, 通过后 push
```

## 数据结构

### ReviewerConfig

```lua
{
  name = "security",                  -- 唯一
  model = "anthropic/claude-sonnet-4-5",
  description = "专注安全",           -- 给 scheduler 看
  prompt = nil,                        -- 自定义, 占位 {{diff}} {{todo}}
  triggers = { "security", "auth" },   -- 关键词, scheduler 据此派发
}
```

### ReviewIssue / ReviewResult

```lua
-- issue:  { file, line?, severity="critical"|"warning"|"info", description, suggestion }
-- result: { reviewer, passed = bool, issues = issue[] }
```

### SchedulerConfig

```lua
{ model = "anthropic/claude-haiku-4-5", prompt = nil }
```

## 配置

见 docs/config.md 的 `review` 段。默认 reviewers：`security`（triggers: security/auth/token/password）、`code-quality`（triggers: refactor/feature/fix）。

## 结构化输出解析

- reviewer 输出 JSON：`{ "passed": bool, "issues": [ {file, line?, severity, description, suggestion} ] }`。
- 解析策略：从输出中正则提取 `{...}`，`JSON.parse`，字段逐项容错（缺失默认值）。失败则视为 `passed=true, issues=[]`。
- scheduler 输出 JSON 数组：`["security", "code-quality"]`，提取 `[...]` 解析；无效名称过滤；空数组 = 无审查员（跳过流水线）。

## 报告格式（report）

```markdown
## 🔍 Xuanjian Code Review

### ✅ security
- 🔴 **src/auth.ts:12** — 硬编码 token
  - Suggestion: 使用环境变量

**Summary**: 3 issue(s) found (1 critical) | Some reviewers reported issues. | ✅ Auto-committed.
```

## 与其它系统集成

- **goal 模式**：里程碑完成触发 `review.completed`（goal 自动审查 `auto_review=true`）；critical 阻断任务返工。
- **CLI**：`xuanjian review ["<todo>"]` 手动触发；`xuanjian run --review` 任务后触发。
- **Lua**：`x.review.register`（自定义审查员）、`x.review.run`（编程触发）；事件 `review.completed`。
- **权限**：`auto_commit` 视同对 git 工具的调用，受权限引擎约束。

## 失败处理

- 非 git 仓库 / 无 HEAD / 无变更：流水线安全返回空结果，不报错。
- 单个 reviewer 调用失败：该 reviewer 结果标记 `passed=false` + error issue；不影响其余并发审查。
- `git commit/push` 失败：记录 warn，`committed/pushed` 返回实际状态。
