# CLI 参考

`xuanjian` 可执行文件（开发时 `bun run src/index.ts`）。所有命令支持 `--help`。

## 全局参数

```
xuanjian <command> [options] [args...]
```

| Flag | 缩写 | 说明 |
|---|---|---|
| `--model <id>` | `-m` | 覆盖模型 `provider/model` |
| `--agent <id>` | `-a` | 覆盖 agent |
| `--provider <id>` | `-p` | 限制 provider |
| `--directory <path>` | `-d` | 工作目录 |
| `--session-id <id>` | | 指定/恢复会话 |
| `--continue` | `-c` | 继续最近会话 |
| `--yes` | `-y` | 自动允许权限询问 |
| `--help` | `-h` | 帮助 |
| `--version` | `-v` | 版本 |

## 子命令

### `xuanjian`（无参数）
进入交互式 REPL。启动显示玄鉴 banner。

### `xuanjian run [options] "<任务>"`
非交互模式，执行单个任务后退出。

```
xuanjian run "修复登录模块的 bug"
xuanjian run -m anthropic/claude-sonnet-4-5 --goal "构建可部署的博客系统"
```

Flags：全局参数 + `--goal <目标>`（进入 goal 模式）、`--review`（完成后自动审查）。

### `xuanjian config`
配置管理，见 docs/config.md。

```
xuanjian config init | path | get <key> | set <key> <value>
```

### `xuanjian workspace`
切换/查看工作区（默认工作目录，持久化到 overrides）。

```
xuanjian workspace                 # 查看当前工作区
xuanjian workspace ~/my-project    # 设置默认工作区（新会话生效）
```

- CLI 命令设置**新会话的默认工作区**。
- TUI 内 `/workspace <path>` 切换**当前会话**工作区——**仅空会话（无消息）可切换**，非空会话会拒绝并提示改用 `xuanjian workspace` 设默认或 `/session resume` 恢复其他会话。

### `xuanjian sessions`
会话管理（按工作区列出 / 恢复 / 删除）。

```
xuanjian sessions                          # 按工作区列出所有会话
xuanjian sessions resume <id>              # 恢复会话（TTY 进入 TUI，非 TTY 打印摘要）
xuanjian sessions delete <id>              # 删除会话及其消息
```

### `xuanjian providers`
Provider 与模型查询。

```
xuanjian providers list              # 列出可用 provider
xuanjian providers list <id>         # 列出某 provider 的模型
```

### `xuanjian auth`
Provider 连接引导（类似 opencode 的 onboarding）。

```
xuanjian auth login                 # 交互式向导：选 provider → 输 API key → 保存
xuanjian auth login anthropic       # 直接连接指定 provider
xuanjian auth list                  # 连接状态（✓ / env / —）
xuanjian auth logout anthropic      # 断开并删除凭据
```

- API key 保存在 `~/.local/share/xuanjian/credentials.json`（0600 权限），也可用环境变量（`provider.api_key_env` 或默认 `ANTHROPIC_API_KEY` 等）。
- 首次连接未设置模型时，自动把默认模型写入 overrides。
- OpenAI 兼容自定义 provider 会额外询问 Base URL。

### `xuanjian review [options] ["<todo>"]`
审查当前 git diff。可选 todo 描述作为上下文。

```
xuanjian review "完成了登录鉴权模块"
```

Flags：`--no-auto-commit`。

### `xuanjian goals`
goal 模式管理（目标持久化在 sqlite）。

```
xuanjian goals list                  # 全部目标及状态
xuanjian goals status <id>           # 目标详情
xuanjian goals resume <id>           # 断点续跑
xuanjian goals abort <id>            # 中止
```

### `xuanjian plugins`
插件查询。

```
xuanjian plugins list                # 列出已加载插件
```

### `xuanjian lsp`
LSP 调试。

```
xuanjian lsp debug                   # 打印语言服务器映射与运行状态
```

### `xuanjian doctor`
环境检查：bun 版本、API key、LSP 服务器可执行文件、配置解析。

## 交互模式（TUI）

`xuanjian` 无参数进入全屏 TUI（需 TTY）。布局：

```
┌──────────────────────────────────────────────┐
│  玄鉴 banner / 滚动输出区（流式文本、⚙工具、diff面板） │
│  ⚙ edit  src/core/agent-loop.ts              │
│  ┌─ diff（GitHub 风格，-红 +绿 @@行号）───────┐ │
│  ⚙ write  src/new.ts                         │
│  ┌─ code（完整内容面板）─────────────────────┐ │
├──────────────────────────────────────────────┤
│  ⚠ 请求权限: bash git push  [y/n/a/s]        │ ← modal
├──────────────────────────────────────────────┤
│  ❯ 输入框（历史 ↑↓）                           │
├──────────────────────────────────────────────┤
│ 模型:… agent:… 模式:… 工作区:… LSP:… DAP:… ctx:… │ ← 持久状态栏
└──────────────────────────────────────────────┘
```

**状态栏字段**：模型（provider/model）、agent、模式（build/plan/goal）、工作区（cwd basename）、LSP（活跃语言服务器 `ts✓ py✗`）、DAP（调试器状态，v1 为 `off`）、ctx（估算 token ÷ 模型上下文窗口）。

**Provider 连接引导**：未配置模型且无任何 provider 凭据时，输入框上方显示 `🔑 尚未连接任何 provider` 引导条。按 `C-o` 或输入 `/auth` 打开连接向导（provider 选择 → API key 输入 → 保存并设默认模型）。

**弹窗（modal）**：所有弹窗（权限确认、提问、provider 选择）都在屏幕中央全屏遮罩中居中显示。provider 选择列表超过终端高度时内部滚动（↑↓），`Enter` 确认、`Esc`/`Ctrl-C` 取消。

**键位**：

| 键 | 行为 |
|---|---|
| `Enter` | 提交输入 |
| `↑` / `↓` | 输入历史（输入为空时滚动输出） |
| `PageUp` / `PageDown` | 滚动输出区 |
| `Ctrl-A` / `Ctrl-E` | 行首 / 行尾 |
| `Ctrl-U` / `Ctrl-K` | 清空整行 / 清至行尾 |
| `Ctrl-W` | 删除前一个词 |
| `Ctrl-C` | 回合中=中断；modal 中=取消；空闲=退出 |
| `Ctrl-L` | 清空输出 |
| `Ctrl-D` | 退出 |
| `Ctrl-O` | 打开 provider 连接向导（onboarding） |
| `Ctrl-Shift-C` / `Cmd-C` | 复制选中文本；无选中时复制最后一条回复（OSC52） |
| `/copy` | 复制最后一条回复（OSC52，终端需支持） |

**复制粘贴说明**：终端内粘贴（`Cmd-V` / `Ctrl-Shift-V`）由输入框原生处理；复制优先用终端自己的选区（Shift+拖选 → `Cmd-C`/`Ctrl-Shift-C`），应用内复制用 `/copy` 或上方复制键（依赖终端 OSC52 支持）。

**权限 modal**：`y` 允许 / `n` 拒绝 / `a` 本次会话 / `s` 总是允许。

## REPL 斜杠命令

在 TUI 中输入 `/命令` 使用：

| 命令 | 说明 |
|---|---|
| `/help` | 帮助 |
| `/model [id]` | 查看/切换模型 |
| `/agent [id]` | 查看/切换 agent |
| `/workspace [p]` | 查看/切换工作区（`p` 为路径，可相对） |
| `/sessions` | 按工作区列出所有会话（`★` 标记当前） |
| `/session resume <id>` | 恢复会话到当前 TUI |
| `/session delete <id>` | 删除会话 |
| `/goal "<目标>"` | 进入 goal 模式 |
| `/review ["<todo>"]` | 触发审查流水线 |
| `/compact` | 手动压缩上下文 |
| `/clear` | 清屏 |
| `/cost` | 显示会话 token/费用统计 |
| `/state` | 显示会话状态 |
| `/exit` | 退出 |

插件可用 `x.command.register(name, fn)` 注册自定义斜杠命令。

## 权限询问

工具调用需要权限时，REPL 交互提示，输入：

| 键 | 含义 |
|---|---|
| `y` | 允许本次 |
| `n` | 拒绝本次 |
| `a` | 允许本次会话所有同类 |
| `s` | 总是允许（写入 allow 列表） |

非交互模式（`run`）下无 TTY 时使用 `permission.default`；`--yes` 等价 `default = "allow"`。

## 退出码

| 码 | 含义 |
|---|---|
| `0` | 成功 |
| `1` | 一般错误 |
| `2` | 任务失败（verify 未通过 / review 阻断 / goal blocked） |
| `130` | 中断（Ctrl-C） |
