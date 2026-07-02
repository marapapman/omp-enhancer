import type { AgentToolResult, ExtensionToolContext, ToolDefinition, ToolUpdate } from '../src/ompApi.js'
import type { GateResult } from '../src/types.js'
import { createTestingEnhancerTools } from '../src/tools/testingTools.js'

interface MarketplaceZodLike {
  object(shape: Record<string, unknown>): unknown
  string(): unknown
  boolean(): unknown
  unknown(): unknown
  array(schema: unknown): unknown
  enum(values: readonly [string, ...string[]]): unknown
  optional(schema: unknown): unknown
}

interface MarketplacePi {
  zod: MarketplaceZodLike
}

interface MarketplaceTool extends Omit<ToolDefinition, 'execute'> {
  execute(
    toolCallId: string,
    params: unknown,
    onUpdate: ((update: ToolUpdate) => void) | undefined,
    ctx: ExtensionToolContext,
    signal: AbortSignal | undefined
  ): Promise<AgentToolResult>
}

export default function createMarketplaceTestingTools(pi: MarketplacePi): MarketplaceTool[] {
  let recentGateResults: GateResult[] = []
  const tools = createTestingEnhancerTools(pi.zod, {
    onGate(output) {
      recentGateResults = output.results
    },
    getRecentGateResults() {
      return recentGateResults
    }
  })

  return tools.map(tool => ({
    ...tool,
    execute(toolCallId, params, onUpdate, ctx, signal) {
      return tool.execute(toolCallId, params, signal, onUpdate, ctx)
    }
  }))
}
