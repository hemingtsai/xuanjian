export interface LuaHttpRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | Record<string, unknown>
  timeout_ms?: number
}

export interface LuaHttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export function request(req: LuaHttpRequest): Promise<LuaHttpResponse> {
  const method = req.method ?? "GET"
  const headers: Record<string, string> = { ...(req.headers ?? {}) }
  let body: string | undefined
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      body = req.body
    } else {
      body = JSON.stringify(req.body)
      headers["content-type"] ??= "application/json"
    }
  }
  const timeout = req.timeout_ms ?? 30_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  return fetch(req.url, { method, headers, body, signal: controller.signal })
    .then(async (res) => {
      clearTimeout(timer)
      const text = await res.text()
      const responseHeaders: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      return { status: res.status, headers: responseHeaders, body: text }
    })
    .catch((err) => {
      clearTimeout(timer)
      throw new Error(`HTTP 请求失败: ${err instanceof Error ? err.message : String(err)}`)
    })
}

export const luaHttp = { request }
