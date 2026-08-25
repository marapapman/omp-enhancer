export interface AgentToolTextContent {
  type: 'text'
  text: string
}

export interface AgentToolResult {
  content: AgentToolTextContent[]
  details?: unknown
  isError?: boolean
}

export interface ZodSchema {
  describe(description: string): ZodSchema
  optional(): ZodSchema
}

export type ToolUpdate = Partial<AgentToolResult>

export interface ExtensionToolContext {
  cwd: string
  exec?: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeout?: number }
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  ui: {
    notify(message: string, level?: 'info' | 'warn' | 'error'): void | Promise<void>
  }
  hasUI: boolean
  sessionManager?: {
    getBranch(): Array<{ type: string; customType?: string; data?: unknown }>
  }
}

export type ExtensionEventHandler = (event: unknown, ctx: ExtensionToolContext) => Promise<unknown> | unknown

export interface ToolDefinition<TParams = unknown> {
  name: string
  label: string
  description: string
  parameters: unknown
  hidden?: boolean
  defaultInactive?: boolean
  deferrable?: boolean
  approval?: 'read' | 'write' | 'exec'
  promptSnippet?: string
  promptGuidelines?: string[]
  execute(
    toolCallId: string,
    params: TParams,
    signal: AbortSignal | undefined,
    onUpdate: ((update: ToolUpdate) => void) | undefined,
    ctx: ExtensionToolContext
  ): Promise<AgentToolResult>
}

export interface ExtensionAPI {
  /** Shared by the per-extension API wrappers in the real OMP loader. */
  events?: object
  zod: {
    z: {
      object(shape: Record<string, unknown>): ZodSchema
      string(): ZodSchema
      boolean(): ZodSchema
      unknown(): ZodSchema
      array(schema: unknown): ZodSchema
      enum(values: readonly [string, ...string[]]): ZodSchema
    }
  }
  setLabel(label: string): void
  registerTool<TParams>(tool: ToolDefinition<TParams>): void
  /** Host shell bridge. OMP 18 exposes exec here, not on the tool context. */
  exec?: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeout?: number }
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  registerMessageRenderer?(customType: string, renderer: unknown): void
  on(event: string, handler: ExtensionEventHandler): void
  appendEntry(customType: string, data: unknown): Promise<void> | void
}
