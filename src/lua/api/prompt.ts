import { requireLuaContext } from "./context"

export function prompt(question: string): Promise<string | undefined> {
  const ctx = requireLuaContext()
  if (!ctx.askUser) return Promise.resolve(undefined)
  return ctx.askUser(question)
}

export const luaPrompt = { prompt: (q: string) => prompt(q) }
