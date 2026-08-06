import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"
import { unifiedDiff } from "../util/diff"

const WriteArgs = z.object({
  file_path: z.string().describe("要写入的文件路径（相对项目路径或绝对路径）"),
  content: z.string().describe("完整文件内容"),
})

export const WriteTool: ToolDef = {
  id: "write",
  description: "写入文件。覆盖整个文件内容；父目录不存在会自动创建。",
  parameters: zodToJsonSchema(WriteArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(WriteArgs, rawArgs)
    const abs = path.isAbsolute(args.file_path) ? args.file_path : path.resolve(ctx.cwd, args.file_path)
    const oldContent = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : ""
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, args.content, "utf8")
    const lines = args.content.split("\n").length
    const diff = unifiedDiff(oldContent, args.content, args.file_path)
    return {
      title: `写入 ${args.file_path} (${lines} 行)`,
      output: `已写入 ${abs}`,
      metadata: { content: args.content, ...(diff ? { diff } : {}) },
    }
  },
}
