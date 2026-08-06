import { LuaFactory, LuaEngine } from "wasmoon"
import { installXApi } from "./api"

let factory: LuaFactory | undefined
let engine: LuaEngine | undefined

export async function getLuaEngine(): Promise<LuaEngine> {
  if (!factory) factory = new LuaFactory()
  if (!engine) {
    engine = await factory.createEngine({ injectObjects: true })
    await installXApi(engine)
  }
  return engine
}

export function getInstalledEngine(): LuaEngine | undefined {
  return engine
}
