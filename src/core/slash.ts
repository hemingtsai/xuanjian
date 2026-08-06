// repl 参数用 any：内置命令与 Lua 命令的 Repl 类型不同，统一放宽
export type SlashHandler = (args: string, repl: any) => string | Promise<string | void> | undefined

const slashCommands = new Map<string, SlashHandler>()

export function registerSlash(name: string, handler: SlashHandler): void {
  slashCommands.set(name, handler)
}

export function unregisterSlash(name: string): void {
  slashCommands.delete(name)
}

export function getSlashHandler(name: string): SlashHandler | undefined {
  return slashCommands.get(name)
}

export function listSlashNames(): string[] {
  return Array.from(slashCommands.keys())
}
