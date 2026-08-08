import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"
import { TodoStore, type TodoItem } from "../core/todo-store"

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
    const todos: TodoItem[] = args.todos
    const store = ctx.extra?.todos
    if (store instanceof TodoStore) store.setItems(todos)
    const summary = todos.map((t) => `[${t.status}] ${t.task}`).join("\n")
    return { title: "更新任务清单", output: summary || "（空清单）" }
  },
}
