import { test, expect } from "bun:test"
import { Store } from "../src/storage/db"
import { SessionManager } from "../src/core/session"
import { toOpenAIMessages } from "../src/llm/protocol/openai-chat"

test("reasoning 回传：存储 → 读取 → OpenAI 请求体带 reasoning_content", () => {
  const store = Store.open()
  const sm = new SessionManager(store)
  const s = sm.create({ cwd: "/tmp" })
  s.addMessage({ role: "user", content: "hi" })
  s.addMessage({ role: "assistant", content: "answer", reasoning: "thinking..." })

  const msgs = s.toLLMMessages()
  expect(msgs[1]).toMatchObject({ role: "assistant", content: "answer", reasoning: "thinking..." })

  const body = toOpenAIMessages(msgs)
  expect(body[1]).toMatchObject({ role: "assistant", content: "answer", reasoning_content: "thinking..." })

  store.close()
})

test("reasoning 持久化到 sqlite 后仍能回传", () => {
  const store = Store.open()
  const sm = new SessionManager(store)
  const s = sm.create({ cwd: "/tmp" })
  s.addMessage({ role: "user", content: "q" })
  s.addMessage({ role: "assistant", content: "a", reasoning: "deep thinking" })

  const reloaded = sm.load(s.id)!
  const msgs = reloaded.toLLMMessages()
  const assistant = msgs.find((m) => m.role === "assistant")
  expect(assistant && "reasoning" in assistant ? assistant.reasoning : undefined).toBe("deep thinking")

  store.close()
})
