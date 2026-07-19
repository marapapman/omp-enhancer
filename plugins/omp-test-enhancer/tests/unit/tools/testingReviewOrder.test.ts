import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestingEnhancerTools } from '../../../src/tools/testingTools.js'
import type { ExtensionToolContext, ToolDefinition } from '../../../src/ompApi.js'

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find(item => item.name === name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

describe('advisory review order for omp_test_review', () => {
  it('evaluates observed command evidence independently from static findings', async () => {
    let testCommandCalls = 0
    const ctx: ExtensionToolContext = {
      cwd: process.cwd(),
      hasUI: false,
      ui: { notify: () => undefined },
      exec: async (program) => {
        if (program !== 'git') testCommandCalls += 1
        return { exitCode: 0, stdout: '', stderr: '' }
      }
    }

    const tools = createTestingEnhancerTools(fakeZod(), {
      getObservedTestCommandEvidence: () => ({
        schemaVersion: 2,
        taskContextIdentity: 'task:review-order',
        commandDigest: createHash('sha256').update('bunx vitest run').digest('hex'),
        exitCode: 0,
        observedAt: Date.now()
      })
    })
    const result = await tool(tools, 'omp_test_review').execute('call', {
      testCommand: 'bunx vitest run',
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.ts', action: 'modify', content: 'export class UserService {}' }] }
    }, undefined, undefined, ctx)

    expect(testCommandCalls).toBe(0)
    expect(result.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: false }),
        expect.objectContaining({ gate: 'test-command', passed: true, summary: 'Matching host-observed test command passed.' })
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
