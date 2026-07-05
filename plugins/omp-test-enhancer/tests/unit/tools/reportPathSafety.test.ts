import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createTestingEnhancerTools } from '../../../src/tools/testingTools.js'
import type { ExtensionToolContext, ToolDefinition } from '../../../src/ompApi.js'

async function tempRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-report-path-'))
  await mkdir(join(cwd, 'reports'), { recursive: true })
  return cwd
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find(item => item.name === name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

function context(cwd: string): ExtensionToolContext {
  return { cwd, hasUI: false, ui: { notify: () => undefined } }
}

describe('coverage and mutation report path safety', () => {
  it('loads valid coverage reports from inside the workspace', async () => {
    const cwd = await tempRepo()
    await writeFile(join(cwd, 'reports', 'coverage-final.json'), JSON.stringify({
      'src/math/clamp.ts': {
        statementMap: { '0': { start: { line: 12 } } },
        s: { '0': 0 }
      }
    }))

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_coverage_analyze').execute(
      'call',
      { reportPath: 'reports/coverage-final.json' },
      undefined,
      undefined,
      context(cwd)
    )

    expect(result.details).toMatchObject({
      status: 'available',
      gaps: [expect.objectContaining({ file: 'src/math/clamp.ts', line: 12 })]
    })
  })

  it('does not read coverage reports outside the workspace through parent traversal', async () => {
    const cwd = await tempRepo()
    const outside = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-outside-'))
    await writeFile(join(outside, 'coverage-final.json'), JSON.stringify({
      'src/secret.ts': {
        statementMap: { '0': { start: { line: 1 } } },
        s: { '0': 0 }
      }
    }))

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_coverage_analyze').execute(
      'call',
      { reportPath: `../${basename(outside)}/coverage-final.json` },
      undefined,
      undefined,
      context(cwd)
    )

    expect(result.details).toEqual({ status: 'missing-report', gaps: [] })
  })

  it('does not read mutation reports through absolute or backslash paths', async () => {
    const cwd = await tempRepo()
    const absolute = join(cwd, 'reports', 'mutation.json')
    await writeFile(absolute, JSON.stringify({
      files: {
        'src/math/clamp.ts': {
          mutants: [{
            id: '1',
            status: 'Survived',
            mutatorName: 'StringLiteral',
            location: { start: { line: 7 } }
          }]
        }
      }
    }))

    const mutationTool = tool(createTestingEnhancerTools(fakeZod()), 'omp_test_mutation_context')
    const absoluteResult = await mutationTool.execute('call', { reportPath: absolute }, undefined, undefined, context(cwd))
    const backslashResult = await mutationTool.execute('call', { reportPath: 'reports\\mutation.json' }, undefined, undefined, context(cwd))

    expect(absoluteResult.details).toEqual({ status: 'missing-report', survivedMutants: [] })
    expect(backslashResult.details).toEqual({ status: 'missing-report', survivedMutants: [] })
  })

  it('treats invalid report JSON as missing instead of throwing', async () => {
    const cwd = await tempRepo()
    await writeFile(join(cwd, 'reports', 'coverage-final.json'), '{ invalid json')

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_coverage_analyze').execute(
      'call',
      { reportPath: 'reports/coverage-final.json' },
      undefined,
      undefined,
      context(cwd)
    )

    expect(result.content[0]?.text).toBe('No coverage report found.')
    expect(result.details).toEqual({ status: 'missing-report', gaps: [] })
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
