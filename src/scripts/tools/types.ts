export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  default?: any
  enum?: string[]
}

export interface ToolExecutionResult {
  success: boolean
  output: any
  summary: string
  error?: string
  data?: any
  meta?: Record<string, any>
}

export interface ToolDefinition {
  id: string
  name: string
  description: string
  category?: 'math' | 'datetime' | 'document' | 'text' | 'utility'
  parameters: ToolParameter[]
  execute: (args: Record<string, any>) => Promise<ToolExecutionResult> | ToolExecutionResult
}

export interface ToolCall {
  id: string
  toolId: string
  toolName: string
  input: Record<string, any>
  result: ToolExecutionResult
  durationMs: number
}

export interface AttachedDocument {
  id: string
  name: string
  type: string
  size: number
  content: string
  uploadedAt: number
  chunks: string[]
}
