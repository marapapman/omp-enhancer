import { describe, expect, it } from 'vitest'
import { createTestingEnhancerTools } from '../../../src/tools/testingTools.js'
import type { ExtensionToolContext, ToolDefinition } from '../../../src/ompApi.js'

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find(item => item.name === name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

describe('omp_test_gate execution order', () => {
  it('does not run the test command when static blocker gates already fail', async () => {
    let testCommandCalls = 0
    const ctx: ExtensionToolContext = {
      cwd: process.cwd(),
      hasUI: false,
      ui: { notify: () => undefined },
      exec: async (program, args) => {
        if (program !== 'git') testCommandCalls += 1
        return { exitCode: 0, stdout: '', stderr: '' }
      }
    }

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_gate').execute('call', {
      testCommand: 'bunx vitest run',
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.ts', action: 'modify', content: 'export class UserService {}' }] }
    }, undefined, undefined, ctx)

    expect(testCommandCalls).toBe(0)
    expect(result.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: false }),
        expect.objectContaining({ gate: 'test-command', severity: 'warning', summary: 'Test command skipped because static blocker gates failed.' })
      ])
    })
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
