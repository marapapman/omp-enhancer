import { describe, expect, it } from 'vitest'
import { registerTestingEnhancer } from '../../src/extension.js'
import { CORE_STATE_ENTRY } from '../../src/session/taskContextIdentity.js'
import { TESTING_EVIDENCE_ENTRY } from '../../src/session/testingState.js'
import type { ExtensionAPI, ExtensionEventHandler, ExtensionToolContext, ToolDefinition } from '../../src/ompApi.js'

class FakePi implements ExtensionAPI {
  readonly tools = new Map<string, ToolDefinition>()
  readonly eventHandlers: Array<{ event: string; handler: ExtensionEventHandler }> = []
  readonly entries: Array<{ type: string; customType: string; data: unknown }> = []
  readonly zod = { z: fakeZod() }

  setLabel(): void {}
  registerTool(tool: ToolDefinition): void { this.tools.set(tool.name, tool) }
  on(event: string, handler: ExtensionEventHandler): void { this.eventHandlers.push({ event, handler }) }
  appendEntry(customType: string, data: unknown): void { this.entries.push({ type: 'custom', customType, data }) }
}

describe('advisory task-context scope e2e', () => {
  it('scopes review evidence to the current core v2 user turn', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    pi.entries.push(coreTaskContextEntry(101))
    const ctx = context(pi)

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const review = pi.tools.get('omp_test_review')
    if (!analyze || !review) throw new Error('Missing testing tools')

    await analyze.execute('old-analyze', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)
    await review.execute('old-review', passingReviewParams(), undefined, undefined, ctx)
    expect(latestEntry(pi, TESTING_EVIDENCE_ENTRY)).toMatchObject({
      taskContextIdentity: 'task:101',
      reviewStatus: 'ready',
      advisory: true
    })

    const evidenceCount = entriesOfType(pi, TESTING_EVIDENCE_ENTRY).length
    pi.entries.push(coreTaskContextEntry(202))
    expect(entriesOfType(pi, TESTING_EVIDENCE_ENTRY)).toHaveLength(evidenceCount)

    await analyze.execute('new-analyze', {
      changedFiles: [{ path: 'src/order/OrderService.ts', content: 'export class OrderService {}' }]
    }, undefined, undefined, ctx)
    expect(latestEntry(pi, TESTING_EVIDENCE_ENTRY)).toMatchObject({
      taskContextIdentity: 'task:202',
      reviewStatus: 'collecting',
      advisory: true
    })

    await review.execute(
      'new-review',
      passingReviewParams('src/order/OrderService.ts', 'OrderService'),
      undefined,
      undefined,
      ctx
    )
    expect(latestEntry(pi, TESTING_EVIDENCE_ENTRY)).toMatchObject({
      taskContextIdentity: 'task:202',
      reviewStatus: 'ready'
    })
  })

  it('uses a local diagnostic identity when no core task context is present', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = context(pi)

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze tool')
    await analyze.execute('analyze', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    expect(pi.eventHandlers.map(item => item.event)).toEqual(['session_start', 'tool_result', 'session_stop'])
    expect(latestEntry(pi, TESTING_EVIDENCE_ENTRY)).toMatchObject({
      taskContextIdentity: expect.stringMatching(/^testing:test-/),
      reviewStatus: 'collecting',
      advisory: true
    })
  })
})

function event(pi: FakePi, name: string): ExtensionEventHandler {
  const found = pi.eventHandlers.find(item => item.event === name)
  if (!found) throw new Error(`Missing event ${name}`)
  return found.handler
}

function context(pi: FakePi): ExtensionToolContext {
  return {
    cwd: process.cwd(),
    hasUI: false,
    ui: { notify: () => undefined },
    sessionManager: { getBranch: () => pi.entries }
  }
}

function coreTaskContextEntry(taskStartedAt: number) {
  return {
    type: 'custom' as const,
    customType: CORE_STATE_ENTRY,
    data: {
      schemaVersion: 2,
      taskStartedAt,
      lastTaskContext: { intent: 'agent-selected' }
    }
  }
}

function entriesOfType(pi: FakePi, customType: string) {
  return pi.entries.filter(entry => entry.customType === customType)
}

function latestEntry(pi: FakePi, customType: string): unknown {
  return entriesOfType(pi, customType).at(-1)?.data
}

function passingReviewParams(sourceFile = 'src/user/UserService.ts', symbolName = 'UserService') {
  const targetId = `${sourceFile}#${symbolName}`
  return {
    targets: [{ id: targetId, sourceFile, symbolName, kind: 'service', risk: 'high' }],
    candidate: {
      id: 'candidate',
      targetId,
      files: [{ path: sourceFile.replace(/\.ts$/, '.test.ts'), action: 'create', content: 'expect(result).toBe(true)' }]
    }
  }
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
