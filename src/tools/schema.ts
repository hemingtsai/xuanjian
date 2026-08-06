import type { z } from "zod"
import type { JSONSchema7 } from "../llm/schema-json"

// 最小 zod → JSON Schema 转换，覆盖内置工具所需类型。
export function zodToJsonSchema(schema: unknown): JSONSchema7 {
  const out: JSONSchema7 = {}
  const z = schema as {
    _def?: unknown
    _zod?: unknown
    typeName?: string
    innerType?: unknown
    shape?: Record<string, unknown>
    element?: unknown
    options?: unknown[]
    values?: unknown[]
    value?: unknown
    description?: string
  }

  const def = (schema as { _def?: unknown })._def as
    | { typeName?: string; innerType?: unknown; shape?: Record<string, unknown>; element?: unknown; options?: unknown[]; value?: unknown }
    | undefined
  if (!def) return { type: "object" }

  switch (def.typeName) {
    case "ZodString":
      out.type = "string"
      break
    case "ZodNumber":
      out.type = "number"
      break
    case "ZodBoolean":
      out.type = "boolean"
      break
    case "ZodEnum": {
      out.type = "string"
      const values = (def as { values?: readonly string[] }).values
      if (values && values.length > 0) out.enum = [...values]
      break
    }
    case "ZodLiteral": {
      const value = (def as { value?: unknown }).value
      if (typeof value === "string") out.type = "string"
      else if (typeof value === "number") out.type = "number"
      else if (typeof value === "boolean") out.type = "boolean"
      out.enum = [value as string | number | boolean]
      break
    }
    case "ZodArray": {
      out.type = "array"
      out.items = zodToJsonSchema((def as { element?: unknown }).element)
      break
    }
    case "ZodObject": {
      out.type = "object"
      const shape = (def as { shape?: Record<string, unknown> }).shape ?? {}
      const props: Record<string, JSONSchema7> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        props[key] = zodToJsonSchema(value)
        const inner = (value as { _def?: { typeName?: string } })._def?.typeName
        if (inner !== "ZodOptional" && inner !== "ZodDefault") required.push(key)
      }
      out.properties = props
      if (required.length > 0) out.required = required
      break
    }
    case "ZodOptional":
    case "ZodDefault":
      return zodToJsonSchema((def as { innerType?: unknown }).innerType)
    case "ZodUnion":
    case "ZodEffects": {
      // 取第一个分支作为近似 schema
      const options = (def as { options?: unknown[] }).options
      if (options && options.length > 0) return zodToJsonSchema(options[0])
      return { type: "object" }
    }
    default:
      out.type = "object"
  }

  const description = (schema as { description?: string }).description
  if (description) out.description = description
  return out
}

export function parseArgs<S extends z.ZodTypeAny>(schema: S, args: Record<string, unknown>): z.infer<S> {
  const result = schema.safeParse(args)
  if (!result.success) {
    const detail = (result.error?.issues ?? []).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    throw new Error(`参数校验失败: ${detail}`)
  }
  return result.data
}
