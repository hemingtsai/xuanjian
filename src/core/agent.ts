import type { Config } from "../config/schema"

export interface AgentInfo {
  id: string
  name?: string
  description?: string
  model?: string
  system_prompt?: string
  tools?: string[]
  subagent?: boolean
}

const BUILD_PROMPT = `You are Xuanjian (玄鉴), the best coding agent on the planet.

You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

- You can ask for clarification, take actions, or answer questions.
- When performing a task, understand the codebase first with read/glob/grep tools before making changes.
- Make MINIMAL changes to achieve the goal. Prefer editing existing files over creating new ones.
- Verify your work: run typecheck/tests where applicable.
- Report results concisely, in the user's language.`

const PLAN_PROMPT = `You are Xuanjian (玄鉴) in plan mode. Your current responsibility is to think, read, search to construct a well-formed plan that accomplishes the goal the user wants to achieve. Your plan should be comprehensive yet concise.

Do not make changes to files. Do not use write/edit/apply_patch/bash tools.
At any point you may ask the user questions or clarifications. Present the final plan clearly.`

export const BUILTIN_AGENTS: AgentInfo[] = [
  { id: "build", name: "Build", description: "通用构建与编码 agent", system_prompt: BUILD_PROMPT, tools: ["*"] },
  {
    id: "plan",
    name: "Plan",
    description: "规划 agent：只读探索并产出计划",
    system_prompt: PLAN_PROMPT,
    tools: ["read", "glob", "grep", "lsp_definition", "lsp_symbols", "lsp_references", "lsp_hover"],
    subagent: false,
  },
]

export function resolveAgents(config: Config): Map<string, AgentInfo> {
  const agents = new Map<string, AgentInfo>()
  for (const builtin of BUILTIN_AGENTS) {
    agents.set(builtin.id, { ...builtin })
  }
  for (const [id, custom] of Object.entries(config.agents)) {
    const base = agents.get(id)
    agents.set(id, { ...base, id, ...custom } as AgentInfo)
  }
  return agents
}

export function resolveAgent(id: string | undefined, config: Config): AgentInfo {
  const agents = resolveAgents(config)
  const agent = id ? agents.get(id) : agents.get(config.default_agent ?? "build")
  return agent ?? agents.get("build")!
}

export function defaultAgentID(config: Config): string {
  return config.default_agent ?? "build"
}
