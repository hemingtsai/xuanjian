import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

export interface TodoItem {
  id: string
  task: string
  status: "todo" | "in_progress" | "done"
  milestone?: string
}

export const DEFAULT_TODOS: TodoItem[] = []

const TodoWriteArgs = z.object({
  todos: z.array(
    z.object({
      id: z.string().describe("唯一 id"),
      task: z.string().describe("任务描述"),
      status: z.enum(["todo", "in_progress", "done"]),
      milestone: z.string().optional(),
    }),
  ),
})

export const TodoWriteTool: ToolDef = {
  id: "todowrite",
  description: "记录任务清单。为多步任务维护 todo 列表，随时用此工具更新进度。",
  parameters: zodToJsonSchema(TodoWriteArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(TodoWriteArgs, rawArgs)
    ctx.extra ??= {}
    ctx.extra.todos = args.todos
    const summary = args.todos.map((t) => `[${t.status}] ${t.task}`).join("\n")
    return { title: "更新任务清单", output: summary || "（空清单）" }
  },
}
