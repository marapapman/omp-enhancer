import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import registerTestingEnhancer from '../../src/extension.js'
import type { ExtensionAPI, ExtensionEventHandler, ExtensionToolContext, ToolDefinition } from '../../src/ompApi.js'

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

describe('plugin load smoke', () => {
  it('loads the extension and rejects internal-import candidate tests', async () => {
    expect(typeof registerTestingEnhancer).toBe('function')

    const pi = new FakePi()
    registerTestingEnhancer(pi)
    expect(pi.tools.has('omp_test_browser_check')).toBe(true)
    expect(pi.tools.has('omp_test_coverage_analyze')).toBe(true)
    expect(pi.tools.has('omp_test_mutation_context')).toBe(true)
    const gate = pi.tools.get('omp_test_review')
    if (!gate) throw new Error('Missing omp_test_review')

    const result = await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: "import { helper } from '../internal/helper'" }] }
    }, undefined, undefined, toolContext())

    expect(result.content[0]?.text).toContain('critical findings')
    expect(result.details).toMatchObject({
      passed: false,
      status: 'findings',
      advisory: true
    })
  })

  it('does not import browser check implementation during extension load', () => {
    const source = readFileSync(join(process.cwd(), 'src/tools/testingTools.ts'), 'utf8')

    expect(source).not.toMatch(/^import\s+\{[^}]*executeBrowserCheck[^}]*\}\s+from '\.\/browserCheck\.js'/m)
  })

  it('returns structured browser-check evidence when optional Playwright cannot load', () => {
    const source = readFileSync(join(process.cwd(), 'src/tools/testingTools.ts'), 'utf8')

    expect(source).toContain("status: 'skipped'")
    expect(source).toContain('Playwright is not installed.')
  })
})

function toolContext(): ExtensionToolContext {
  return { cwd: process.cwd(), ui: { notify: () => undefined }, hasUI: false }
}

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
