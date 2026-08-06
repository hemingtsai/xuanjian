import { LuaFactory, LuaEngine } from "wasmoon"

let factory: LuaFactory | undefined
let engine: LuaEngine | undefined

export async function getLuaEngine(): Promise<LuaEngine> {
  if (!factory) factory = new LuaFactory()
  if (!engine) engine = await factory.createEngine()
  return engine
}
