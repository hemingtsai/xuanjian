import { ToolRegistry } from "./registry"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { EditTool } from "./edit"
import { ApplyPatchTool } from "./apply_patch"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { BashTool } from "./bash"
import { TodoWriteTool } from "./todo"

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(ReadTool)
  registry.register(WriteTool)
  registry.register(EditTool)
  registry.register(ApplyPatchTool)
  registry.register(GlobTool)
  registry.register(GrepTool)
  registry.register(BashTool)
  registry.register(TodoWriteTool)
  return registry
}

export { ToolRegistry }
