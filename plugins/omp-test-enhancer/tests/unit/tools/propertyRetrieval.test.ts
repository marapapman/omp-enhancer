import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createTestingEnhancerTools } from '../../../src/tools/testingTools.js'
import type { ExtensionToolContext, ToolDefinition } from '../../../src/ompApi.js'

async function tempRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-property-'))
  await mkdir(join(cwd, 'src', 'format'), { recursive: true })
  await mkdir(join(cwd, 'src', 'math'), { recursive: true })
  await mkdir(join(cwd, 'tests', 'properties'), { recursive: true })
  await writeFile(join(cwd, 'src', 'format', 'normalizeName.ts'), 'export function normalizeName(value: string) { return value.trim().toLowerCase() }')
  await writeFile(join(cwd, 'src', 'math', 'clamp.ts'), 'export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }')
  return cwd
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find(item => item.name === name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

function context(cwd: string, exec?: ExtensionToolContext['exec']): ExtensionToolContext {
  return { cwd, hasUI: false, ui: { notify: () => undefined }, ...(exec ? { exec } : {}) }
}

async function runContext(cwd: string, target: Record<string, unknown>, exec?: ExtensionToolContext['exec']) {
  return tool(createTestingEnhancerTools(fakeZod()), 'omp_test_context').execute(
    'call',
    { target },
    undefined,
    undefined,
    context(cwd, exec)
  )
}

describe('property retrieval edge cases', () => {
  it('ignores malformed local experience JSON while keeping static property guidance', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, '.omp', 'testing-enhancer'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-enhancer', 'property-examples.json'), '{ broken json')

    const result = await runContext(cwd, {
      id: 'src/math/clamp.ts#clamp',
      sourceFile: 'src/math/clamp.ts',
      symbolName: 'clamp',
      kind: 'pure-function',
      risk: 'low'
    })

    expect(result.details).toMatchObject({
      propertyPlan: {
        retrieval: {
          sources: expect.arrayContaining([
            { path: 'src/math/clamp.ts', reason: 'target source for invariant signals' }
          ])
        },
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'range bound' })
        ])
      }
    })
  })

  it('accepts array-form experience entries and a string match field', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, '.omp'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-properties.json'), JSON.stringify([{
      match: 'normalizeName',
      name: 'normalized lowercase output',
      assertion: 'Generated names produce lowercase normalized output.',
      repairHint: 'Generate whitespace, mixed case, unicode, and repeated separator examples.'
    }]))

    const result = await runContext(cwd, {
      id: 'src/format/normalizeName.ts#normalizeName',
      sourceFile: 'src/format/normalizeName.ts',
      symbolName: 'normalizeName',
      kind: 'formatter',
      risk: 'low'
    })

    expect(result.details).toMatchObject({
      propertyPlan: {
        properties: expect.arrayContaining([
          expect.objectContaining({
            name: 'normalized lowercase output',
            sources: ['.omp/testing-properties.json']
          })
        ])
      }
    })
  })

  it('does not apply experience entries for a different target kind', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, '.omp'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-enhancer-properties.json'), JSON.stringify({
      properties: [{
        kind: 'validator',
        match: ['clamp'],
        name: 'validator-only property',
        assertion: 'Generated invalid values are rejected.',
        repairHint: 'Use invalid values for validator targets only.'
      }]
    }))

    const result = await runContext(cwd, {
      id: 'src/math/clamp.ts#clamp',
      sourceFile: 'src/math/clamp.ts',
      symbolName: 'clamp',
      kind: 'pure-function',
      risk: 'low'
    })

    expect(result.details).toMatchObject({
      propertyPlan: {
        properties: expect.not.arrayContaining([
          expect.objectContaining({ name: 'validator-only property' })
        ])
      }
    })
  })

  it('merges duplicate property names from experience and retrieved test patterns', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, '.omp', 'testing-enhancer'), { recursive: true })
    await writeFile(join(cwd, 'src', 'format', 'normalizeName.test.ts'), [
      "import { normalizeName } from './normalizeName'",
      'test("idempotent", () => {',
      '  expect(normalizeName(normalizeName("  Ada  "))).toEqual(normalizeName("  Ada  "))',
      '})'
    ].join('\n'))
    await writeFile(join(cwd, '.omp', 'testing-enhancer', 'property-examples.json'), JSON.stringify({
      properties: [{
        match: ['normalizeName'],
        name: 'retrieved idempotence',
        assertion: 'Applying normalize twice is stable.',
        repairHint: 'Generate already-normalized and messy names.'
      }]
    }))

    const result = await runContext(cwd, {
      id: 'src/format/normalizeName.ts#normalizeName',
      sourceFile: 'src/format/normalizeName.ts',
      symbolName: 'normalizeName',
      kind: 'formatter',
      risk: 'low',
      relatedTests: ['src/format/normalizeName.test.ts']
    })

    const properties = (result.details as { propertyPlan: { properties: Array<{ name: string; sources?: string[] }> } }).propertyPlan.properties
    const idempotence = properties.filter(property => property.name === 'retrieved idempotence')
    expect(idempotence).toHaveLength(1)
    expect(idempotence[0]?.sources).toEqual([
      '.omp/testing-enhancer/property-examples.json',
      'src/format/normalizeName.test.ts'
    ])
  })

  it('survives git grep failures and still returns context', async () => {
    const cwd = await tempRepo()
    const exec: ExtensionToolContext['exec'] = async (_program, args) => {
      if (args[0] === 'grep') return { exitCode: 1, stdout: '', stderr: 'not a git repository' }
      return { exitCode: 0, stdout: '', stderr: '' }
    }

    const result = await runContext(cwd, {
      id: 'src/math/clamp.ts#clamp',
      sourceFile: 'src/math/clamp.ts',
      symbolName: 'clamp',
      kind: 'pure-function',
      risk: 'low'
    }, exec)

    expect(result.details).toMatchObject({
      propertyPlan: {
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'range bound' })
        ])
      }
    })
  })

  it('retrieves local similar property tests from git grep results', async () => {
    const cwd = await tempRepo()
    await writeFile(join(cwd, 'tests', 'properties', 'clamp.property.test.ts'), [
      "import fc from 'fast-check'",
      'test("clamp boundaries", () => {',
      '  fc.assert(fc.property(fc.integer(), value => {',
      '    expect(value).toBeGreaterThanOrEqual(Number.MIN_SAFE_INTEGER)',
      '  }))',
      '})'
    ].join('\n'))
    const exec: ExtensionToolContext['exec'] = async (_program, args) => {
      if (args[0] === 'grep') return { exitCode: 0, stdout: 'tests/properties/clamp.property.test.ts\n../outside.property.test.ts\n', stderr: '' }
      if (args[0] === 'ls-files') return { exitCode: 0, stdout: 'src/math/clamp.ts\ntests/properties/clamp.property.test.ts\n', stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
    }

    const result = await runContext(cwd, {
      id: 'src/math/clamp.ts#clamp',
      sourceFile: 'src/math/clamp.ts',
      symbolName: 'clamp',
      kind: 'pure-function',
      risk: 'low'
    }, exec)

    expect(result.details).toMatchObject({
      propertyPlan: {
        retrieval: {
          sources: expect.arrayContaining([
            { path: 'tests/properties/clamp.property.test.ts', reason: 'local similar test with property signals' }
          ])
        },
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'retrieved generator model', sources: ['tests/properties/clamp.property.test.ts'] })
        ])
      }
    })
    expect(JSON.stringify(result.details)).not.toContain('../outside.property.test.ts')
  })

  it('does not create property plans for service targets', async () => {
    const cwd = await tempRepo()

    const result = await runContext(cwd, {
      id: 'src/user/UserService.ts#UserService',
      sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService',
      kind: 'service',
      risk: 'high'
    })

    expect(result.details).toMatchObject({
      testingStyle: 'indirect'
    })
    expect((result.details as { propertyPlan?: unknown }).propertyPlan).toBeUndefined()
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
