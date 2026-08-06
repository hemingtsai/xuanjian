import { test, expect, afterAll } from "bun:test"
import { spawn } from "node:child_process"
import { LSPClient } from "../src/lsp/client"
import { detectLanguage, pathToURI, LSPManager } from "../src/lsp/manager"
import { definition, documentSymbols } from "../src/lsp/features"
import { writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Config } from "../src/config/schema"

// 一个最小的伪语言服务器：响应 initialize/documentSymbol 与 definition
const FAKE_SERVER = `
let pending = new Map()
let buf = ""
process.stdin.on("data", (c) => {
  buf += c
  while (true) {
    const i = buf.indexOf("\\r\\n\\r\\n")
    if (i === -1) break
    const head = buf.slice(0, i)
    const m = head.match(/Content-Length:\\s*(\\d+)/i)
    if (!m) { buf = buf.slice(i + 4); continue }
    const n = Number(m[1]); const body = buf.slice(i + 4, i + 4 + n)
    buf = buf.slice(i + 4 + n)
    let msg
    try { msg = JSON.parse(body) } catch { continue }
    if (msg.id !== undefined) {
      let result = {}
      if (msg.method === "initialize") result = { capabilities: { textDocumentSync: 1 } }
      if (msg.method === "textDocument/documentSymbol") result = [
        { name: "hello", kind: 12, range: { start: { line: 0, character: 0 }, end: { line: 1, character: 2 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
      ]
      if (msg.method === "textDocument/definition") result = [
        { uri: "file:///def.ts", range: { start: { line: 3, character: 1 }, end: { line: 3, character: 4 } } },
      ]
      const out = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })
      process.stdout.write("Content-Length: " + Buffer.byteLength(out) + "\\r\\n\\r\\n" + out)
    }
  }
})
`

const dir = mkdtempSync(path.join(tmpdir(), "xj-lsp-"))
const serverFile = path.join(dir, "fake-server.js")
writeFileSync(serverFile, FAKE_SERVER)
const config: Config = {
  default_agent: "build",
  theme: "dark",
  provider: {},
  lsp: { typescript: { command: process.execPath, args: [serverFile] } },
  permission: {},
  agents: {},
  review: {},
  goal: {},
  plugins: [],
}

test("detectLanguage by extension", () => {
  expect(detectLanguage("a.ts")).toBe("typescript")
  expect(detectLanguage("b.py")).toBe("python")
  expect(detectLanguage("c.unknown")).toBeUndefined()
})

test("pathToURI format", () => {
  expect(pathToURI("/tmp/x/a.ts")).toBe("file:///tmp/x/a.ts")
})

test("LSP JSON-RPC roundtrip via fake server", async () => {
  const client = LSPClient.spawn(process.execPath, [serverFile], dir)
  await client.send("initialize", { capabilities: {} })
  const symbols = await client.send("textDocument/documentSymbol", { textDocument: { uri: "file:///a.ts" } })
  expect(Array.isArray(symbols)).toBe(true)
  expect((symbols as { name: string }[])[0]!.name).toBe("hello")
  await client.shutdown()
})

test("LSPManager + features", async () => {
  const manager = new LSPManager(config, dir)
  const defs = await definition(manager, path.join(dir, "a.ts"), { line: 0, character: 0 })
  expect(defs.length).toBeGreaterThan(0)
  expect(defs[0]!.uri).toBe("file:///def.ts")
  const symbols = await documentSymbols(manager, path.join(dir, "a.ts"))
  expect(symbols.map((s) => s.name)).toContain("hello")
  manager.shutdown()
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})
