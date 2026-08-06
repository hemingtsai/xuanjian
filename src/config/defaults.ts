import type { Config } from "./schema"

export const DEFAULTS: Config = {
  default_agent: "build",
  theme: "dark",
  provider: {},
  lsp: {},
  permission: { default: "ask", allow: [], deny: [] },
  agents: {},
  review: {
    enabled: true,
    auto_commit: false,
    auto_push: false,
    reviewers: [
      {
        name: "security",
        model: "",
        description: "专注安全漏洞、鉴权与敏感信息泄露",
        triggers: ["security", "auth", "token", "password", "credential"],
      },
      {
        name: "code-quality",
        model: "",
        description: "代码质量、可维护性、健壮性与最佳实践",
        triggers: ["refactor", "feature", "fix", "bug"],
      },
    ],
  },
  goal: {
    verification: ["test", "typecheck", "lsp"],
    max_attempts: 3,
    max_steps: 100,
    max_tokens: 0,
    checkpoint: "write",
    auto_review: true,
  },
  plugins: [],
}
