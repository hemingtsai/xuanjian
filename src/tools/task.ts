import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

export interface SubagentInput {
  description: string
  agent?: string
  model?: string
}

export type SubagentRunner = (input: SubagentInput) => Promise<{ text: string; iterations: number }>

const TaskArgs = z.object({
  description: z.string().describe("子代理要完成的任务描述"),
  agent: z.string().optional().describe("使用哪个子 agent（如 plan）"),
  model: z.string().optional().describe("子代理使用的模型"),
})

export const TaskTool: ToolDef = {
  id: "task",
  description: "启动一个子代理独立完成任务（只读探索）。适合并行调研、拆解子问题。返回子代理最终结论。",
  parameters: zodToJsonSchema(TaskArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(TaskArgs, rawArgs)
    const runner = ctx.extra?.subagent as SubagentRunner | undefined
    if (!runner) {
      return { title: "task", output: "子代理在当前上下文不可用" }
    }
    const result = await runner({ description: args.description, agent: args.agent, model: args.model })
    return { title: `子代理: ${args.description.slice(0, 40)}`, output: result.text || "（子代理无输出）" }
  },
}
