import { createHmac, createHash } from "node:crypto"
import type { Adapter, CompleteParams, LLMEvent, LLMMessage } from "../llm"

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex")
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest()
}

interface AwsCreds {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
}

function getCreds(region: string): AwsCreds {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("缺少 AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY")
  }
  return { accessKeyId, secretAccessKey, sessionToken: process.env.AWS_SESSION_TOKEN, region }
}

function signRequest(req: { method: string; url: URL; headers: Record<string, string>; body: string }, creds: AwsCreds): void {
  const service = "bedrock"
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "")
  const dateStamp = amzDate.slice(0, 8)
  const canonicalHeaders =
    "content-type:" + req.headers["content-type"] + "\n" +
    "host:" + req.url.host + "\n" +
    (creds.sessionToken ? "x-amz-security-token:" + creds.sessionToken + "\n" : "") +
    "x-amz-date:" + amzDate + "\n"
  const signedHeaders =
    "content-type;host" + (creds.sessionToken ? ";x-amz-security-token" : "") + ";x-amz-date"

  const canonicalRequest =
    req.method + "\n" +
    req.url.pathname + "\n" +
    req.url.search.replace(/^\?/, "") + "\n" +
    canonicalHeaders + "\n" +
    signedHeaders + "\n" +
    sha256(req.body)

  const scope = `${dateStamp}/${creds.region}/${service}/aws4_request`
  const stringToSign =
    "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256(canonicalRequest)

  const kDate = hmac(Buffer.from("AWS4" + creds.secretAccessKey, "utf8"), dateStamp)
  const kRegion = hmac(kDate, creds.region)
  const kService = hmac(kRegion, service)
  const kSigning = hmac(kService, "aws4_request")
  const signature = hmac(kSigning, stringToSign).toString("hex")

  req.headers["authorization"] = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  req.headers["x-amz-date"] = amzDate
  if (creds.sessionToken) req.headers["x-amz-security-token"] = creds.sessionToken
}

function toConverseMessages(messages: LLMMessage[]): unknown[] {
  const out: unknown[] = []
  for (const message of messages) {
    if (message.role === "tool") {
      out.push({
        role: "user",
        content: [{ toolResult: { toolUseId: message.toolCallId, content: [{ text: message.content }] } }],
      })
      continue
    }
    if (message.role === "user") {
      out.push({ role: "user", content: [{ text: message.content }] })
      continue
    }
    const content: unknown[] = []
    if (message.content) content.push({ text: message.content })
    for (const tc of message.toolCalls ?? []) {
      content.push({ toolUse: { toolUseId: tc.id, name: tc.name, input: tc.args } })
    }
    out.push({ role: "assistant", content })
  }
  return out
}

// AWS 二进制事件流解码
function* decodeEventStream(buffer: Buffer): Generator<{ headers: Record<string, string>; payload: Buffer }> {
  let offset = 0
  while (offset + 4 <= buffer.length) {
    const totalLen = buffer.readUInt32BE(offset)
    if (totalLen < 16 || offset + totalLen > buffer.length) break
    const headerLen = buffer.readUInt32BE(offset + 4)
    if (headerLen < 4 || headerLen > totalLen) break
    const preludeCRC = buffer.readUInt32BE(offset + 8)
    if (preludeCRC !== crc32(buffer.subarray(offset, offset + 8))) break
    const headers: Record<string, string> = {}
    let hOffset = offset + 12
    const hEnd = offset + 12 + (headerLen - 4)
    while (hOffset < hEnd) {
      const nameLen = buffer[hOffset]!
      hOffset += 1
      const name = buffer.subarray(hOffset, hOffset + nameLen).toString("utf8")
      hOffset += nameLen
      const type = buffer[hOffset]!
      hOffset += 1
      const valLen = buffer.readUInt16BE(hOffset)
      hOffset += 2
      const value = buffer.subarray(hOffset, hOffset + valLen)
      hOffset += valLen
      if (type === 7) headers[name] = value.toString("utf8")
      else if (type === 8) headers[name] = value.toString("base64")
    }
    const payloadEnd = offset + totalLen - 4
    const payload = buffer.subarray(offset + 12 + (headerLen - 4), payloadEnd)
    const messageCRC = buffer.readUInt32BE(payloadEnd)
    if (messageCRC !== crc32(buffer.subarray(offset, payloadEnd))) break
    yield { headers, payload }
    offset += totalLen
  }
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

export class BedrockAdapter implements Adapter {
  readonly type = "bedrock" as const

  async *complete(params: CompleteParams): AsyncIterable<LLMEvent> {
    const region = params.extra?.region ?? process.env.AWS_REGION ?? "us-east-1"
    let creds: AwsCreds
    try {
      creds = getCreds(region)
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : String(err) }
      return
    }

    const model = params.model
    const body: Record<string, unknown> = {
      modelId: model,
      messages: toConverseMessages(params.messages),
      inferenceConfig: {},
    }
    if (params.system) body.system = [{ text: params.system }]
    if (params.tools && params.tools.length > 0) {
      body.toolConfig = {
        tools: params.tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.parameters ?? { type: "object", properties: {} } } } })),
      }
    }
    if (params.temperature !== undefined) body.inferenceConfig = { temperature: params.temperature }
    if (params.maxTokens !== undefined) body.inferenceConfig = { ...(body.inferenceConfig as object), maxTokens: params.maxTokens }

    const url = new URL(`https://bedrock-runtime.${region}.amazonaws.com/model/${model}/converse-stream`)
    const bodyStr = JSON.stringify(body)
    const headers: Record<string, string> = { "content-type": "application/json", host: url.host }
    try {
      signRequest({ method: "POST", url, headers, body: bodyStr }, creds)
    } catch (err) {
      yield { type: "error", message: err instanceof Error ? err.message : String(err) }
      return
    }

    let response: Response
    try {
      response = await fetch(url, { method: "POST", headers, body: bodyStr, signal: params.signal })
    } catch (err) {
      yield { type: "error", message: `请求失败: ${err instanceof Error ? err.message : String(err)}` }
      return
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      yield { type: "error", message: `Bedrock ${response.status}: ${text.slice(0, 500)}` }
      return
    }

    const buf = Buffer.from(await response.arrayBuffer())
    const toolAcc = new Map<string, { name: string; args: string }>()
    let streamEnded = false
    for (const event of decodeEventStream(buf)) {
      const type = event.headers[":message-type"] ?? ""
      if (type === "exception") {
        yield { type: "error", message: `Bedrock exception: ${event.payload.toString("utf8")}` }
        return
      }
      if (type !== "event") continue
      const eventType = event.headers[":event-type"] ?? ""
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(event.payload.toString("utf8"))
      } catch {
        continue
      }
      switch (eventType) {
        case "contentBlockDelta": {
          const delta = payload.delta as Record<string, unknown> | undefined
          if (delta?.text) yield { type: "text", text: String(delta.text) }
          break
        }
        case "contentBlockStart": {
          const block = payload.start as Record<string, unknown> | undefined
          const toolUse = block?.toolUse as Record<string, unknown> | undefined
          if (toolUse) {
            const id = String(toolUse.toolUseId ?? "")
            toolAcc.set(id, { name: String(toolUse.name ?? ""), args: "" })
          }
          break
        }
        case "contentBlockDeltaIndex":
          break
        case "messageStop": {
          for (const [id, cur] of toolAcc) {
            if (!cur.name) continue
            let args: Record<string, unknown> = {}
            try {
              args = JSON.parse(cur.args || "{}")
            } catch {
              args = {}
            }
            yield { type: "tool_call", id, name: cur.name, args }
          }
          yield { type: "done" }
          streamEnded = true
          return
        }
      }
    }
    if (!streamEnded) yield { type: "done" }
  }
}
