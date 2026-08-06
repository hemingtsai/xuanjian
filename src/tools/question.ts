import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

const QuestionArgs = z.object({
  question: z.string().describe("要向用户提出的问题"),
  choices: z.array(z.string()).optional().describe("候选答案列表"),
})

export const QuestionTool: ToolDef = {
  id: "question",
  description: "向用户提出一个问题并等待回答。用于需要用户决策或澄清时。",
  parameters: zodToJsonSchema(QuestionArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(QuestionArgs, rawArgs)
    if (!ctx.ask) {
      return { title: "提问", output: `（非交互环境无法提问）问题: ${args.question}` }
    }
    const prompt = args.choices && args.choices.length > 0 ? `${args.question}\n选项: ${args.choices.join(" / ")}` : args.question
    const answer = await ctx.ask(prompt)
    if (answer === undefined || answer.trim() === "") {
      return { title: "提问", output: "（用户未回答）" }
    }
    return { title: "提问", output: `用户回答: ${answer.trim()}` }
  },
}
