import { z } from "zod"
import type { ToolContext, ToolDef, ExecuteResult } from "./registry"
import { parseArgs, zodToJsonSchema } from "./schema"

const WebFetchArgs = z.object({
  url: z.string().describe("要抓取的 URL"),
  format: z.enum(["markdown", "text", "html"]).optional().describe("输出格式，默认 text"),
})

const MAX_BYTES = 256 * 1024

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<title>([^<]*)<\/title>/i, "# $1\n")
    .replace(/<h([1-6])[^>]*>([^<]*)<\/h\1>/gi, (_, lv, text) => `${"#".repeat(Number(lv))} ${text}\n`)
    .replace(/<li[^>]*>([^<]*)<\/li>/gi, "- $1\n")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, "[$2]($1)")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export const WebFetchTool: ToolDef = {
  id: "webfetch",
  description: "抓取网页内容。用于读取在线文档、API 文档、问题单等。",
  parameters: zodToJsonSchema(WebFetchArgs),
  async call(ctx: ToolContext, rawArgs) {
    const args = parseArgs(WebFetchArgs, rawArgs)
    let response: Response
    try {
      response = await fetch(args.url, { signal: ctx.abort })
    } catch (err) {
      throw new Error(`抓取失败: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${args.url}`)
    const buf = await response.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) throw new Error(`内容过大 (${buf.byteLength} 字节 > ${MAX_BYTES})`)
    const contentType = response.headers.get("content-type") ?? ""
    const text = new TextDecoder().decode(buf)

    let output: string
    if (args.format === "html" || contentType.includes("text/html")) {
      output = args.format === "html" ? text : htmlToText(text)
    } else {
      output = text
    }
    return { title: `webfetch ${args.url}`, output: output.slice(0, MAX_BYTES) }
  },
}
