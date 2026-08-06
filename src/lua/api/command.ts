import { registerSlash } from "../../core/slash"
import { getLuaContext, bufferCommand } from "./context"

export function register(name: string, fn: (args: string) => unknown): void {
  if (!name || typeof name !== "string") throw new Error("x.command.register 需要命令名")
  const handler = async (args: string): Promise<string | undefined> => {
    const result = await fn(args)
    return result === undefined || typeof result === "string" ? result : String(result)
  }
  const ctx = getLuaContext()
  if (ctx) {
    registerSlash(name, handler)
  } else {
    bufferCommand(name, handler)
  }
}

export function unregister(name: string): void {
  void name
  // 运行时卸载省略：REPL 会话期间注册的命令保持有效
}

export const luaCommand = { register, unregister }
