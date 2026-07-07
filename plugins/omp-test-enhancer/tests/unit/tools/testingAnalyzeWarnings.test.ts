import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createTestingEnhancerTools } from '../../../src/tools/testingTools.js'
import type { ExtensionToolContext, ToolDefinition } from '../../../src/ompApi.js'

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find(item => item.name === name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

describe('omp_test_analyze warnings', () => {
  it('warns when requested files are skipped as unsafe or unreadable', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-warnings-'))
    const ctx: ExtensionToolContext = { cwd, hasUI: false, ui: { notify: () => undefined } }

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_analyze').execute('call', {
      files: ['../outside.ts', '/tmp/outside.ts']
    }, undefined, undefined, ctx)

    expect(result.details).toMatchObject({
      targets: [],
      warnings: ['No readable changed files detected. Check that requested files are relative paths inside the repository.']
    })
  })

  it('falls back to process cwd when runtime context omits cwd', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-runtime-cwd-'))
    const sourcePath = 'src/router.ts'
    await mkdir(dirname(join(cwd, sourcePath)), { recursive: true })
    await writeFile(join(cwd, sourcePath), 'export function routeTask() { return "ok" }')

    const originalCwd = process.cwd()
    try {
      process.chdir(cwd)
      const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_analyze').execute('call', {
        files: [sourcePath]
      }, undefined, undefined, { hasUI: false, ui: { notify: () => undefined } } as ExtensionToolContext)

      expect(result.details).toMatchObject({
        warnings: [],
        targets: [expect.objectContaining({ sourceFile: sourcePath })]
      })
    } finally {
      process.chdir(originalCwd)
    }
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
