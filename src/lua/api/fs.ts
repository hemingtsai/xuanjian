import fs from "node:fs"
import path from "node:path"
import { getLuaContext } from "./context"

function resolve(file: string): string {
  const ctx = getLuaContext()
  const base = ctx?.cwd ?? process.cwd()
  return path.isAbsolute(file) ? file : path.resolve(base, file)
}

export function read(file: string): string | undefined {
  const abs = resolve(file)
  if (!fs.existsSync(abs)) return undefined
  return fs.readFileSync(abs, "utf8")
}

export function write(file: string, content: string): void {
  const abs = resolve(file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, "utf8")
}

export function append(file: string, content: string): void {
  const abs = resolve(file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.appendFileSync(abs, content, "utf8")
}

export function exists(file: string): boolean {
  return fs.existsSync(resolve(file))
}

export function deletePath(file: string): void {
  fs.rmSync(resolve(file), { recursive: true, force: true })
}

export function glob(pattern: string): string[] {
  const ctx = getLuaContext()
  const base = ctx?.cwd ?? process.cwd()
  const matches: string[] = []
  const g = new Bun.Glob(pattern)
  for (const p of g.scanSync({ cwd: base })) {
    matches.push(String(p))
  }
  return matches.sort()
}

export function stat(file: string): { size: number; mtime: number; is_dir: boolean; is_file: boolean } | undefined {
  const abs = resolve(file)
  if (!fs.existsSync(abs)) return undefined
  const s = fs.statSync(abs)
  return { size: s.size, mtime: s.mtimeMs, is_dir: s.isDirectory(), is_file: s.isFile() }
}

export const luaFs = { read, write, append, exists, delete: deletePath, glob, stat }
