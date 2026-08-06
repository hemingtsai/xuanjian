export type JSONSchema7 = {
  type?: string
  properties?: Record<string, JSONSchema7>
  items?: JSONSchema7
  required?: string[]
  description?: string
  enum?: unknown[]
  [key: string]: unknown
}
