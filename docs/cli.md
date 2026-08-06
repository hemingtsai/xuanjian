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

### `xuanjian providers`
Provider 与模型查询。

```
xuanjian providers list              # 列出可用 provider
xuanjian providers list <id>         # 列出某 provider 的模型
```

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

## REPL 斜杠命令

在 REPL 中输入 `/命令` 使用：

| 命令 | 说明 |
|---|---|
| `/help` | 帮助 |
| `/model [id]` | 查看/切换模型 |
| `/agent [id]` | 查看/切换 agent |
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
