export interface SSEEvent {
  event?: string
  data?: string
  raw: string
}

export async function* parseSSE(body: ReadableStream<Uint8Array> | null, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  if (!body) return
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError")
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        const line = raw.replace(/\r$/, "")
        if (line === "") continue
        if (line.startsWith(":")) continue // 注释行
        let event: string | undefined
        let data = ""
        for (const part of line.split("\n")) {
          if (part.startsWith("event:")) event = part.slice(6).trim()
          else if (part.startsWith("data:")) data = part.slice(5).trimStart()
        }
        yield { event, data, raw: line }
      }
    }
    if (buffer.trim().length > 0) {
      const line = buffer.replace(/\r$/, "")
      let event: string | undefined
      let data = ""
      if (line.startsWith("event:")) event = line.slice(6).trim()
      else if (line.startsWith("data:")) data = line.slice(5).trimStart()
      yield { event, data, raw: line }
    }
  } finally {
    reader.releaseLock()
  }
}
