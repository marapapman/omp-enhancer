import { describe, expect, it } from 'vitest'
import { registerTestingEnhancer } from '../../src/extension.js'
import type { ExtensionAPI, ExtensionEventHandler, ToolDefinition } from '../../src/ompApi.js'

class FakePi implements ExtensionAPI {
  readonly labels: string[] = []
  readonly tools = new Map<string, ToolDefinition>()
  readonly eventHandlers: Array<{ event: string; handler: ExtensionEventHandler }> = []
  readonly entries: Array<{ customType: string; data: unknown }> = []
  readonly zod = { z: fakeZod() }

  setLabel(label: string): void { this.labels.push(label) }
  registerTool(tool: ToolDefinition): void { this.tools.set(tool.name, tool) }
  on(event: string, handler: ExtensionEventHandler): void { this.eventHandlers.push({ event, handler }) }
  appendEntry(customType: string, data: unknown): void { this.entries.push({ customType, data }) }
}

describe('registerTestingEnhancer', () => {
  it('registers only optional advisory tools and observation hooks', () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)

    expect(pi.labels).toEqual(['OMP Testing Enhancer'])
    expect([...pi.tools.keys()]).toEqual([
      'omp_test_analyze',
      'omp_test_context',
      'omp_test_browser_check',
      'omp_test_coverage_analyze',
      'omp_test_mutation_context',
      'omp_test_review',
      'omp_test_report'
    ])
    expect([...pi.tools.values()].every(tool => typeof tool.execute === 'function')).toBe(true)
    expect([...pi.tools.values()].every(tool => tool.defaultInactive === true)).toBe(true)
    expect(pi.tools.get('omp_test_browser_check')?.approval).toBe('exec')
    expect(
      [...pi.tools.values()]
        .filter(tool => tool.name !== 'omp_test_browser_check')
        .every(tool => tool.approval === 'read')
    ).toBe(true)
    expect(pi.eventHandlers.map(handler => handler.event)).toEqual([
      'session_start',
      'tool_result',
      'session_stop'
    ])
  })
})

function fakeZod() {
  return {
    object: (shape: Record<string, unknown>) => ({ type: 'object', shape }),
    string: () => ({ type: 'string' }),
    boolean: () => ({ type: 'boolean' }),
    unknown: () => ({ type: 'unknown' }),
    array: (schema: unknown) => ({ type: 'array', schema }),
    enum: (values: readonly [string, ...string[]]) => ({ type: 'enum', values }),
    optional: (schema: unknown) => ({ type: 'optional', schema })
  }
}
