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
  it('evaluates observed command evidence without invoking the host command runner', async () => {
    let commandCalls = 0
    const ctx: ExtensionToolContext = {
      cwd: process.cwd(),
      hasUI: false,
      ui: { notify: () => undefined },
      exec: async () => {
        commandCalls += 1
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

    expect(commandCalls).toBe(0)
    expect(result.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: false }),
        expect.objectContaining({ gate: 'test-command', passed: true, summary: 'Matching host-observed test command passed.' })
      ])
    })
  })

  it('reports missing explicit analyze evidence without invoking the host command runner', async () => {
    let commandCalls = 0
    const ctx: ExtensionToolContext = {
      cwd: process.cwd(),
      hasUI: false,
      ui: { notify: () => undefined },
      exec: async () => {
        commandCalls += 1
        return { exitCode: 0, stdout: '', stderr: '' }
      }
    }

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_analyze').execute(
      'call',
      {},
      undefined,
      undefined,
      ctx
    )

    expect(commandCalls).toBe(0)
    expect(result.details).toMatchObject({
      targets: [],
      warnings: ['No explicit changed-file evidence provided. Pass workspace-relative paths through omp_test_analyze.files or content through changedFiles.']
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
