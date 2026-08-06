import fs from "node:fs"
import path from "node:path"
import { ensureDataDir, dataDir } from "./paths"

export interface Credential {
  apiKey?: string
  baseUrl?: string
}

let cache: Record<string, Credential> | null = null

function file(): string {
  return path.join(dataDir(), "credentials.json")
}

function load(): Record<string, Credential> {
  if (cache) return cache
  try {
    const raw = fs.readFileSync(file(), "utf8")
    cache = JSON.parse(raw) as Record<string, Credential>
  } catch {
    cache = {}
  }
  return cache
}

function save(data: Record<string, Credential>): void {
  cache = data
  ensureDataDir()
  const filePath = file()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // 非 POSIX 环境忽略
  }
}

export function getCredential(providerId: string): Credential | undefined {
  return load()[providerId]
}

export function hasApiKey(providerId: string): boolean {
  return Boolean(load()[providerId]?.apiKey)
}

export function setCredential(providerId: string, credential: Credential): void {
  const data = load()
  data[providerId] = { ...data[providerId], ...credential }
  save(data)
}

export function deleteCredential(providerId: string): void {
  const data = load()
  delete data[providerId]
  save(data)
}

export function listCredentials(): { providerId: string; hasKey: boolean; baseUrl?: string }[] {
  return Object.entries(load()).map(([providerId, cred]) => ({
    providerId,
    hasKey: Boolean(cred.apiKey),
    baseUrl: cred.baseUrl,
  }))
}
