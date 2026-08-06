import type { Options } from "./args"

export async function runTask(message: string, options: Options, goal: string | undefined): Promise<number> {
  if (goal) {
    process.stdout.write(`goal 模式 "${goal}" 将在后续功能提交中实现。\n`)
    return 2
  }
  if (!message) {
    process.stderr.write("run 需要任务文本，例如: xuanjian run \"修复登录 bug\"\n")
    return 2
  }
  process.stdout.write(`任务 "${message}" 将在 agent loop 功能提交后执行。\n`)
  return 2
}
