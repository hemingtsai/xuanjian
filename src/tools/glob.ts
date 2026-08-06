import path from "node:path"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

const GlobArgs = z.object({
  pattern: z.string().describe("glob 模式，如 'src/**/*.ts'"),
  base: z.string().optional().describe("搜索基目录，默认项目根"),
  ignore: z.array(z.string()).optional().describe("忽略的 glob 模式"),
})

export const GlobTool: ToolDef = {
  id: "glob",
  description: "按 glob 模式查找文件路径。返回匹配文件列表。",
  parameters: zodToJsonSchema(GlobArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(GlobArgs, rawArgs)
    const base = args.base ? path.resolve(ctx.cwd, args.base) : ctx.cwd
    const options: { absolute: boolean; onlyFiles?: boolean; dot?: boolean; cwd?: string } = { absolute: true, cwd: base }
    const paths = await new Bun.Glob(args.pattern).scan({ ...options })
    const results: string[] = []
    for await (const p of paths) {
      const rel = path.relative(ctx.cwd, p as string)
      if (rel.startsWith("node_modules") || rel.startsWith(".git")) continue
      results.push(rel)
    }
    const sorted = results.sort()
    const truncated = sorted.length > 200 ? `\n...共 ${sorted.length} 个文件，仅显示前 200` : ""
    return { title: `glob ${args.pattern} (${sorted.length} 个)`, output: sorted.slice(0, 200).join("\n") + truncated }
  },
}
