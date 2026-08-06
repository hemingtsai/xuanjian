-- 示例插件：review 自定义审查员
-- 演示 x.review.register 注册一个自定义审查员

x.log.info("review 插件已加载")

x.review.register {
  name = "naming",
  model = "anthropic/claude-haiku-4-5",
  description = "检查命名规范（驼峰/蛇形一致性）",
  triggers = { "refactor", "rename", "命名" },
  prompt = [[
You are a naming reviewer. Review the diff and report naming violations.
{{diff}}
Task: {{todo}}
Return JSON: { "passed": bool, "issues": [ {file, line?, severity, description, suggestion} ] }
]],
}

-- 演示 x.goal.create 用法（由用户触发）
x.command.register("goal-demo", function(args)
  if args == "" then
    return "用法: /goal-demo \"目标描述\""
  end
  local gid = x.goal.create { title = args, description = "由 review 插件创建" }
  return "已创建 goal: " .. gid
end)
