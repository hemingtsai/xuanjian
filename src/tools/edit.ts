import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"
import { unifiedDiff } from "../util/diff"

const EditArgs = z.object({
  file_path: z.string().describe("要编辑的文件路径"),
  old_string: z.string().describe("要被替换的原文（必须精确匹配）"),
  new_string: z.string().describe("替换后的新文本"),
  replace_all: z.boolean().optional().describe("为 true 时替换所有匹配；默认只替换第一处"),
})

export const EditTool: ToolDef = {
  id: "edit",
  description: "对文件做精确字符串替换。old_string 必须唯一匹配（除非 replace_all）。",
  parameters: zodToJsonSchema(EditArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(EditArgs, rawArgs)
    const abs = path.isAbsolute(args.file_path) ? args.file_path : path.resolve(ctx.cwd, args.file_path)
    if (!fs.existsSync(abs)) throw new Error(`文件不存在: ${abs}`)
    const content = fs.readFileSync(abs, "utf8")
    if (!content.includes(args.old_string)) throw new Error(`old_string 未在文件中找到:\n${args.old_string.slice(0, 200)}`)
    const count = content.split(args.old_string).length - 1
    if (count > 1 && !args.replace_all) {
      throw new Error(`old_string 出现 ${count} 次，请提供更多上下文或设置 replace_all=true`)
    }
    const next = args.replace_all ? content.split(args.old_string).join(args.new_string) : content.replace(args.old_string, args.new_string)
    fs.writeFileSync(abs, next, "utf8")
    const diff = unifiedDiff(content, next, args.file_path)
    return { title: `编辑 ${args.file_path}`, output: `已替换 ${args.replace_all ? count : 1} 处`, metadata: diff ? { diff } : undefined }
  },
}
