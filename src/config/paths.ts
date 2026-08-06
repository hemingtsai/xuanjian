import os from "node:os"
import path from "node:path"
import fs from "node:fs"

// 配置目录 ~/.config/xuanjian/（支持 XDG_CONFIG_HOME）：
//   - xuanjian.lua      主配置
//   - plugins/          插件
//   - overrides.lua     运行时覆盖（自动生成）
export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg ? path.join(xdg, "xuanjian") : path.join(os.homedir(), ".config", "xuanjian")
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
  return path.join(configDir(), "overrides.lua")
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

// —— 旧路径（~/.config/xuanjian.lua + ~/.config/xuanjian.d/）迁移 ——

function xdgConfigBase(): string {
  return process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config")
}

function legacyConfigFilePath(): string {
  return path.join(xdgConfigBase(), "xuanjian.lua")
}

function legacyStateDir(): string {
  return path.join(xdgConfigBase(), "xuanjian.d")
}

export function migrateLegacyPaths(): void {
  const legacy = legacyConfigFilePath()
  if (!fs.existsSync(legacy) || fs.existsSync(configFilePath())) return
  try {
    fs.mkdirSync(configDir(), { recursive: true })
    fs.renameSync(legacy, configFilePath())

    const legacyState = legacyStateDir()
    if (fs.existsSync(legacyState)) {
      const legacyPlugins = path.join(legacyState, "plugins")
      if (fs.existsSync(legacyPlugins) && !fs.existsSync(pluginsDir())) {
        fs.renameSync(legacyPlugins, pluginsDir())
      }
      const legacyOverrides = path.join(legacyState, "overrides.lua")
      if (fs.existsSync(legacyOverrides) && !fs.existsSync(overridesFilePath())) {
        fs.renameSync(legacyOverrides, overridesFilePath())
      }
    }
  } catch {
    // 迁移失败不阻塞启动
  }
}
