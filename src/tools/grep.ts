import path from "node:path"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

const GrepArgs = z.object({
  pattern: z.string().describe("要搜索的正则表达式"),
  path: z.string().optional().describe("搜索的目录或文件，默认项目根"),
  include: z.array(z.string()).optional().describe("限定文件 glob 模式"),
  ignore: z.array(z.string()).optional().describe("忽略的 glob 模式"),
  context: z.number().int().optional().describe("每处匹配的上下文行数"),
})

export const GrepTool: ToolDef = {
  id: "grep",
  description: "正则搜索文件内容。返回 文件:行: 匹配文本 列表。",
  parameters: zodToJsonSchema(GrepArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(GrepArgs, rawArgs)
    const searchPath = args.path ? path.resolve(ctx.cwd, args.path) : ctx.cwd
    const context = args.context ?? 0
    const cwd = path.dirname(searchPath)

    const proc = Bun.spawn(
      ["rg", "--line-number", "--color", "never", "--with-filename", ...(args.include?.flatMap((g) => ["-g", g]) ?? []), ...(args.ignore?.flatMap((g) => ["-g", `!${g}`]) ?? []), args.pattern, searchPath],
      { stdout: "pipe", stderr: "pipe", cwd },
    )
    const stdout = await new Response(proc.stdout).text()
    const code = await proc.exited
    if (code !== 0) {
      // rg 退出码 1 = 无匹配
      if (code === 1) return { title: `grep ${args.pattern} (0 处)`, output: "无匹配" }
      const stderr = await new Response(proc.stderr).text()
      return { title: `grep ${args.pattern}`, output: `rg 失败: ${stderr.slice(0, 300)}` }
    }
    const lines = stdout.split("\n").filter(Boolean)
    const result: string[] = []
    if (context > 0) {
      for (const line of lines) {
        result.push(line)
      }
    } else {
      result.push(...lines)
    }
    const truncated = result.length > 200 ? `\n...共 ${result.length} 条，仅显示前 200` : ""
    return { title: `grep ${args.pattern} (${result.length} 条)`, output: result.slice(0, 200).join("\n") + truncated }
  },
}
