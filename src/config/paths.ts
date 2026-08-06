import os from "node:os"
import path from "node:path"
import fs from "node:fs"

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  if (xdg) return path.join(xdg, "xuanjian")
  return path.join(os.homedir(), ".config", "xuanjian")
}

export function configFilePath(): string {
  return path.join(configDir(), "xuanjian.lua")
}

export function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  if (xdg) return path.join(xdg, "xuanjian")
  return path.join(os.homedir(), ".local", "share", "xuanjian")
}

export function overridesFilePath(): string {
  return path.join(configDir(), "xuanjian.d", "overrides.lua")
}

export function pluginsDir(): string {
  return path.join(configDir(), "plugins")
}

export function ensureConfigDir(): void {
  fs.mkdirSync(configDir(), { recursive: true })
}

export function ensureDataDir(): void {
  fs.mkdirSync(dataDir(), { recursive: true })
}
