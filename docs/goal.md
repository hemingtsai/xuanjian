# goal 长程自主模式

goal 模式让玄鉴接受一个高层目标，自主完成 **分解 → 规划 → 执行 → 验证 → 审查** 的闭环，而非一句一答。目标与任务持久化在 sqlite，可断点续跑。

## 定位与状态机

```
用户输入目标
  → status: "planning"    planner(只读) 产出任务 DAG
  → status: "active"      goal-loop 逐任务推进
  → status: "done"        全部里程碑通过 + 最终审查
  → status: "blocked"     某任务耗尽重试 / 审查 critical 阻断
  → status: "paused"      blocked 后等待用户介入, 可 resume
  → status: "cancelled"   用户中止
```

## 数据模型

```lua
goal {
  id = "g_xxx", title, description?,
  status = "planning"|"active"|"paused"|"done"|"blocked"|"cancelled",
  model,                            -- 执行用模型
  tasks = { task[] },               -- 任务 DAG
  created_at, updated_at,
}

task {
  id = "t_xxx", title, description?, goal_id,
  status = "todo"|"in_progress"|"done"|"blocked"|"skipped",
  deps = { "t_id", ... },           -- 依赖: 依赖未 done 前不启动
  checkpoint = "write"|nil,         -- 任务执行前若含写操作需用户确认
  attempts = 0, max_attempts,       -- 重试计数
  result = { diff?, review?, notes? },  -- 完成产物
}
```

## 执行闭环 goal-loop

对每个就绪任务（deps 全部 done 且非 done/blocked）：

1. **plan** — 只读子代理（read/grep/glob/lsp）产出该任务实施步骤，写回 `notes`。
2. **act** — 以执行 agent 身份运行（写工具 + 权限门）。`checkpoint="write"` 时在首个写操作前暂停征求确认。
3. **verify** — 按 `goal.verification` 执行：
   - `test`：运行测试（配置或发现）
   - `typecheck`：运行类型检查（按项目探测）
   - `lsp`：检查 LSP 诊断无 error
   任一失败 → `attempts+1`，若 `< max_attempts` 返回 act 修复，否则 task → blocked，goal → paused。
4. **review**（里程碑任务，`auto_review=true`）— 触发审查流水线；critical 阻断 → 返工（计入 attempts）。
5. **done** — 标记 task done，保存 `result`。全部任务 done → goal done → 最终审查 → 报告。

依赖为 DAG：无依赖或依赖全 done 的任务方可 in_progress。v0.1 串行推进，`task` 子代理可用于并行化探索。

## 预算与安全

| 配置 | 默认 | 行为 |
|---|---|---|
| `goal.max_attempts` | 3 | 单任务最大重试 |
| `goal.max_steps` | 100 | 全局总步数上限, 超限 → blocked |
| `goal.max_tokens` | 0(不限) | 全局 token 预算 |
| `goal.checkpoint` | `"write"` | 破坏性写操作前确认 |
| `goal.auto_review` | true | 里程碑自动审查 |

超限触发 `goal.blocked` 事件并暂停，等待用户 resume/调整预算。

## 报告（goal.done）

```
目标: <title>  ✅ 完成 (用时 12m, 8 个任务)

里程碑:
  ✅ t_1 搭建项目骨架        (deps: —)
  ✅ t_2 实现核心模块        (deps: t_1)
  ...
审查: 2 个审查员通过, 0 critical

变更: 24 个文件, +1860/-120 行
```

## CLI 与 Lua

```bash
xuanjian run --goal "构建一个可部署的博客系统"   # 启动 goal 模式
xuanjian goals list | status <id> | resume <id> | abort <id>
```

```lua
local gid = x.goal.create { title = "构建博客系统" }
x.goal.add_task(gid, { title = "搭建项目骨架", deps = {} })
x.goal.status(gid)
```

事件：`goal.started` `goal.task.done` `goal.milestone.review` `goal.blocked` `goal.done`。

## 恢复

进程中断后 `xuanjian goals resume <id>` 从最后一个 in_progress 任务续跑。任务 `result.notes` 提供上下文；in_progress 任务重置为 todo 重新执行（幂等设计：任务应可在中途重启）。
