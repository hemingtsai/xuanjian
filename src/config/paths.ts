import os from "node:os"
import path from "node:path"
import fs from "node:fs"

// 配置主体为 ~/.config/xuanjian.lua（用户要求字面路径）；
// 辅助文件（插件/overrides）置于 ~/.config/xuanjian.d/ 下（Unix .d 惯例）。
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg ?? path.join(os.homedir(), ".config")
}

export function configFilePath(): string {
  return path.join(configDir(), "xuanjian.lua")
}

export function xuanjianStateDir(): string {
  return path.join(configDir(), "xuanjian.d")
}

export function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  if (xdg) return path.join(xdg, "xuanjian")
  return path.join(os.homedir(), ".local", "share", "xuanjian")
}

export function overridesFilePath(): string {
  return path.join(xuanjianStateDir(), "overrides.lua")
}

export function pluginsDir(): string {
  return path.join(xuanjianStateDir(), "plugins")
}

export function ensureConfigDir(): void {
  fs.mkdirSync(xuanjianStateDir(), { recursive: true })
}

export function ensureDataDir(): void {
  fs.mkdirSync(dataDir(), { recursive: true })
}
