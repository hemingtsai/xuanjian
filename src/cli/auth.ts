import * as readline from "node:readline"
import fs from "node:fs"
import type { Config } from "../config/schema"
import { getCredential, setCredential, deleteCredential, listCredentials, hasApiKey } from "../config/credentials"
import { setOverride } from "../config/overrides"
import { BUILTIN_PROVIDERS } from "../llm/providers"

export interface LoginTarget {
  id: string
  label: string
  custom: boolean
  isOpenAICompatible: boolean
  defaultModel?: string
  baseUrl?: string
  apiKeyEnv?: string
}

export function loginTargets(config: Config): LoginTarget[] {
  const targets: LoginTarget[] = BUILTIN_PROVIDERS.map((p) => ({
    id: p.id,
    label: `${p.id}（${p.type}）`,
    custom: false,
    isOpenAICompatible: p.type === "openai-compatible" || p.type === "openai",
    defaultModel: p.default_model ? `${p.id}/${p.default_model}` : undefined,
    baseUrl: p.base_url,
    apiKeyEnv: p.api_key_env,
  }))
  for (const [id, entry] of Object.entries(config.provider)) {
    if (targets.some((t) => t.id === id)) continue
    const isOai = entry.type === undefined || entry.type === "openai-compatible" || entry.type === "openai"
    targets.push({
      id,
      label: `${id}（自定义${isOai ? " · OpenAI 兼容" : ""}）`,
      custom: true,
      isOpenAICompatible: isOai,
      defaultModel: entry.default_model ? `${id}/${entry.default_model}` : undefined,
      baseUrl: entry.base_url,
      apiKeyEnv: entry.api_key_env,
    })
  }
  return targets
}

function createPrompter(): { ask: (q: string) => Promise<string>; close: () => void } {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const queue: string[] = []
  const pending: ((line: string) => void)[] = []
  rl.on("line", (line) => {
    const p = pending.shift()
    if (p) p(line)
    else queue.push(line)
  })
  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => {
      process.stdout.write(question)
      const queued = queue.shift()
      if (queued !== undefined) resolve(queued.trim())
      else pending.push((line) => resolve(line.trim()))
    })
  return { ask, close: () => rl.close() }
}

export async function authLogin(config: Config, providerId?: string): Promise<number> {
  const targets = loginTargets(config)
  const { ask, close } = createPrompter()

  let target: LoginTarget
  if (providerId) {
    const found = targets.find((t) => t.id === providerId)
    if (!found) {
      process.stderr.write(`未知 provider "${providerId}"。可用: ${targets.map((t) => t.id).join(", ")}\n`)
      close()
      return 1
    }
    target = found
  } else {
    process.stdout.write("\n选择要连接的 provider（输入编号）:\n")
    targets.forEach((t, i) => {
      const connected = hasApiKey(t.id) || (t.apiKeyEnv ? Boolean(process.env[t.apiKeyEnv]) : false)
      process.stdout.write(`  ${String(i + 1).padStart(2)}. ${t.label}${connected ? "  ✓" : ""}\n`)
    })
    const answer = await ask("\n编号: ")
    const idx = Number.parseInt(answer, 10) - 1
    if (Number.isNaN(idx) || idx < 0 || idx >= targets.length) {
      process.stderr.write("无效编号。\n")
      close()
      return 1
    }
    target = targets[idx]!
  }

  process.stdout.write(`\n连接 ${target.label}\n`)

  let baseUrl = target.baseUrl ?? ""
  if (target.isOpenAICompatible) {
    const input = await ask(target.baseUrl ? `Base URL [${target.baseUrl}]: ` : "Base URL (如 https://api.deepseek.com/v1): ")
    if (input) baseUrl = input
  }

  const existing = getCredential(target.id)?.apiKey
  const keyInput = await ask(existing ? `API key [已保存 ${mask(existing)}，回车保持不变]: ` : "API key: ")
  const apiKey = keyInput || existing

  if (!apiKey) {
    process.stderr.write("未提供 API key，连接取消。\n")
    close()
    return 1
  }

  setCredential(target.id, { apiKey, ...(baseUrl && baseUrl !== target.baseUrl ? { baseUrl } : {}) })
  process.stdout.write(`\n✓ 已连接 ${target.id}\n`)

  const model = target.defaultModel
  if (model && !config.model) {
    await setOverride("model", model)
    process.stdout.write(`默认模型已设为 ${model}（可 /model 或 config set model 更改）\n`)
  }
  close()
  return 0
}

export function authLogout(providerId: string): number {
  if (!providerId) {
    process.stderr.write("auth logout 需要 provider id。\n")
    return 1
  }
  if (!hasApiKey(providerId)) {
    process.stderr.write(`${providerId} 未保存凭据。\n`)
    return 1
  }
  deleteCredential(providerId)
  process.stdout.write(`已断开 ${providerId}（如使用环境变量，请自行移除）\n`)
  return 0
}

export function authList(config: Config): number {
  const targets = loginTargets(config)
  process.stdout.write("Provider 连接状态:\n")
  for (const t of targets) {
    const viaEnv = t.apiKeyEnv ? Boolean(process.env[t.apiKeyEnv]) : false
    const viaCreds = hasApiKey(t.id)
    const mark = viaEnv ? "env" : viaCreds ? "✓" : "—"
    process.stdout.write(`  ${t.id.padEnd(22)} ${t.label}  [${mark}]\n`)
  }
  const creds = listCredentials().filter((c) => !targets.some((t) => t.id === c.providerId))
  for (const c of creds) {
    process.stdout.write(`  ${c.providerId.padEnd(22)} （凭据文件） [✓]\n`)
  }
  return 0
}

function mask(key: string): string {
  if (key.length <= 6) return "*".repeat(key.length)
  return `${key.slice(0, 3)}${"*".repeat(Math.min(key.length - 6, 8))}${key.slice(-3)}`
}
