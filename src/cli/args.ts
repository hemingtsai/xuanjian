export type Command =
  | { kind: "repl" }
  | { kind: "run"; message: string; goal: string | undefined; review: boolean }
  | { kind: "config"; sub: "init" | "path" | "get" | "set"; key: string | undefined; value: string | undefined }
  | { kind: "providers"; id: string | undefined }
  | { kind: "review"; todo: string | undefined; noAutoCommit: boolean }
  | { kind: "goals"; sub: "list" | "status" | "resume" | "abort"; id: string | undefined }
  | { kind: "plugins" }
  | { kind: "lsp"; sub: "debug" }
  | { kind: "doctor" }
  | { kind: "help" }
  | { kind: "version" }

export interface Options {
  model?: string
  agent?: string
  provider?: string
  directory?: string
  sessionId?: string
  continueSession: boolean
  yes: boolean
  help: boolean
}

const GLOBAL_FLAGS = new Set(["model", "agent", "provider", "directory", "session-id", "continue", "yes", "help", "version"])

function takeValue(
  args: string[],
  i: number,
  inline: string | undefined,
  name: string,
): { value: string; next: number } {
  if (inline !== undefined) return { value: inline, next: i }
  const value = args[i + 1]
  if (value === undefined) throw new Error(`flag --${name} 需要值`)
  return { value, next: i + 1 }
}

export function parseArgs(argv: string[]): { command: Command; options: Options } {
  const options: Options = { continueSession: false, yes: false, help: false }

  const positionals: string[] = []
  let i = 0
  let command = "repl"
  let runMessage = ""
  let runGoal: string | undefined
  let runReview = false
  let configSub = "init"
  let configKey: string | undefined
  let configValue: string | undefined
  let providersId: string | undefined
  let reviewTodo: string | undefined
  let reviewNoAutoCommit = false
  let goalsSub = "list"
  let goalsId: string | undefined

  const isFlag = (a: string) => a.startsWith("-")

  for (; i < argv.length; i++) {
    const arg = argv[i]!
    if (!isFlag(arg)) {
      if (command === "repl" && positionals.length === 0 && arg !== "repl") {
        command = arg
        continue
      }
      positionals.push(arg)
      continue
    }
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1))
      break
    }
    let name = arg.replace(/^--?/, "")
    let inline: string | undefined
    const eq = name.indexOf("=")
    if (eq !== -1) {
      inline = name.slice(eq + 1)
      name = name.slice(0, eq)
    }
    switch (name) {
      case "h":
      case "help":
        options.help = true
        break
      case "v":
      case "version":
        options.help = true
        command = "version"
        break
      case "m":
      case "model":
        ;({ value: options.model, next: i } = takeValue(argv, i, inline, "model"))
        break
      case "a":
      case "agent":
        ;({ value: options.agent, next: i } = takeValue(argv, i, inline, "agent"))
        break
      case "p":
      case "provider":
        ;({ value: options.provider, next: i } = takeValue(argv, i, inline, "provider"))
        break
      case "d":
      case "directory":
        ;({ value: options.directory, next: i } = takeValue(argv, i, inline, "directory"))
        break
      case "session-id":
        ;({ value: options.sessionId, next: i } = takeValue(argv, i, inline, "session-id"))
        break
      case "c":
      case "continue":
        options.continueSession = true
        break
      case "y":
      case "yes":
        options.yes = true
        break
      case "goal":
        ;({ value: runGoal, next: i } = takeValue(argv, i, inline, "goal"))
        break
      case "review":
        runReview = true
        break
      case "no-auto-commit":
        reviewNoAutoCommit = true
        break
      default:
        throw new Error(`未知参数 --${name}`)
    }
  }

  if (command === "run") {
    runMessage = positionals.join(" ")
  } else if (command === "config") {
    configSub = positionals[0] ?? "init"
    if (configSub === "get" || configSub === "set") {
      configKey = positionals[1]
      configValue = positionals[2]
    }
  } else if (command === "providers") {
    providersId = positionals[0] === "list" || positionals[0] === "ls" ? positionals[1] : positionals[0]
  } else if (command === "review") {
    reviewTodo = positionals[0]
  } else if (command === "goals") {
    goalsSub = (positionals[0] as typeof goalsSub) ?? "list"
    goalsId = positionals[1]
  } else if (command === "lsp") {
    // handled below
  }

  let finalCommand: Command
  switch (command) {
    case "repl":
      finalCommand = { kind: "repl" }
      break
    case "run":
      finalCommand = { kind: "run", message: runMessage, goal: runGoal, review: runReview }
      break
    case "config":
      finalCommand = { kind: "config", sub: configSub as "init" | "path" | "get" | "set", key: configKey, value: configValue }
      break
    case "providers":
      finalCommand = { kind: "providers", id: providersId }
      break
    case "review":
      finalCommand = { kind: "review", todo: reviewTodo, noAutoCommit: reviewNoAutoCommit }
      break
    case "goals":
      finalCommand = { kind: "goals", sub: goalsSub as "list" | "status" | "resume" | "abort", id: goalsId }
      break
    case "plugins":
      finalCommand = { kind: "plugins" }
      break
    case "lsp":
      finalCommand = { kind: "lsp", sub: "debug" }
      break
    case "doctor":
      finalCommand = { kind: "doctor" }
      break
    case "version":
      finalCommand = { kind: "version" }
      break
    default:
      finalCommand = { kind: "help" }
  }

  return { command: finalCommand, options }
}
