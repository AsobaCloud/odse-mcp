export interface ToolExecution {
  runtime: 'python3' | 'bash' | 'node'
  script: string
  args: string[]
  default_timeout?: number
  max_timeout?: number
}

export interface ToolConfig {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
  execution: ToolExecution
}

export interface ToolResult {
  content: string
  is_error: boolean
}
