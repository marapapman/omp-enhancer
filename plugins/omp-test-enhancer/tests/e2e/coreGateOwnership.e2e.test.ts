import { describe, expect, it } from 'vitest'
import { registerTestingEnhancer } from '../../src/extension.js'
import { CORE_GATE_OWNER_SYMBOL, CORE_STATE_ENTRY } from '../../src/session/gateOwnership.js'
import { TESTING_EVIDENCE_ENTRY, TESTING_STATE_ENTRY } from '../../src/session/testingState.js'
import type { CommandDefinition, ExtensionAPI, ExtensionEventHandler, ExtensionToolContext, ToolDefinition } from '../../src/ompApi.js'

class SharedFakePi implements ExtensionAPI {
  readonly events: object
  readonly commands = new Map<string, CommandDefinition>()
  readonly tools = new Map<string, ToolDefinition>()
  readonly eventHandlers: Array<{ event: string; handler: ExtensionEventHandler; source: 'testing' | 'core' }> = []
  readonly entries: Array<{ type: string; customType: string; data: unknown }> = []
  readonly zod = { z: fakeZod() }
  private registrationSource: 'testing' | 'core' = 'testing'

  constructor(events: object = {}) {
    this.events = events
  }

  setLabel(): void {}
  registerCommand(name: string, command: CommandDefinition): void { this.commands.set(name, command) }
  registerTool(tool: ToolDefinition): void { this.tools.set(tool.name, tool) }
  on(event: string, handler: ExtensionEventHandler): void {
    this.eventHandlers.push({ event, handler, source: this.registrationSource })
  }
  sendUserMessage(): void {}
  appendEntry(customType: string, data: unknown): void { this.entries.push({ type: 'custom', customType, data }) }

  registerAs(source: 'testing' | 'core', register: () => void): void {
    this.registrationSource = source
    register()
    this.registrationSource = 'testing'
  }
}

describe('core gate ownership e2e', () => {
  for (const order of ['testing-first', 'core-first'] as const) {
    it(`returns at most one continuation when registered ${order}`, async () => {
      const pi = new SharedFakePi()
      const registerTesting = () => pi.registerAs('testing', () => registerTestingEnhancer(pi))
      const registerCore = () => pi.registerAs('core', () => registerCoreOwnerStub(pi))

      if (order === 'testing-first') {
        registerTesting()
        registerCore()
      } else {
        registerCore()
        registerTesting()
      }

      const ctx = context(pi)
      await runHandlers(pi, 'session_start', ctx)
      const analyze = pi.tools.get('omp_test_analyze')
      if (!analyze) throw new Error('Missing analyze')
      await analyze.execute('call', {
        changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
      }, undefined, undefined, ctx)

      const stopResults = await runHandlers(pi, 'session_stop', ctx)
      expect(stopResults.filter(result => isContinuation(result))).toHaveLength(1)
      expect(stopResults[pi.eventHandlers.filter(item => item.event === 'session_stop').findIndex(item => item.source === 'testing')]).toBeUndefined()
    })
  }

  it('publishes no replayed PASS across a core route transition and accepts fresh route evidence', async () => {
    const pi = new SharedFakePi()
    pi.registerAs('testing', () => registerTestingEnhancer(pi))
    pi.registerAs('core', () => registerCoreOwnerStub(pi))
    pi.entries.push(coreRouteEntry('route:old:1'))
    const ctx = context(pi)

    await runHandlers(pi, 'session_start', ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_gate')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('old-analyze', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)
    await gate.execute('old-gate', passingGateParams(), undefined, undefined, ctx)
    expect(latestEntry(pi, TESTING_EVIDENCE_ENTRY)).toMatchObject({
      routeId: 'route:old:1',
      status: 'passed'
    })

    const evidenceCount = entriesOfType(pi, TESTING_EVIDENCE_ENTRY).length
    pi.entries.push(coreRouteEntry('route:new:2'))
    await runHandlers(pi, 'session_stop', ctx)
    expect(entriesOfType(pi, TESTING_EVIDENCE_ENTRY)).toHaveLength(evidenceCount)
    expect(latestEntry(pi, TESTING_STATE_ENTRY)).toMatchObject({
      routeId: 'route:new:2',
      pendingGate: false,
      lastTargets: [],
      lastGateResults: []
    })

    await analyze.execute('new-analyze', {
      changedFiles: [{ path: 'src/order/OrderService.ts', content: 'export class OrderService {}' }]
    }, undefined, undefined, ctx)
    expect(latestEntry(pi, TESTING_EVIDENCE_ENTRY)).toMatchObject({
      routeId: 'route:new:2',
      status: 'pending'
    })
    await gate.execute('new-gate', passingGateParams('src/order/OrderService.ts', 'OrderService'), undefined, undefined, ctx)
    expect(latestEntry(pi, TESTING_EVIDENCE_ENTRY)).toMatchObject({
      routeId: 'route:new:2',
      status: 'passed'
    })
  })

  it('uses the shared EventBus lease across distinct real-loader-style API wrappers', async () => {
    const sharedEvents = {}
    const testingPi = new SharedFakePi(sharedEvents)
    const corePi = new SharedFakePi(sharedEvents)
    testingPi.registerAs('testing', () => registerTestingEnhancer(testingPi))
    corePi.registerAs('core', () => registerCoreOwnerStub(corePi))

    const ctx = context(testingPi)
    await runHandlers(testingPi, 'session_start', ctx)
    const analyze = testingPi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    const testingStops = await runHandlers(testingPi, 'session_stop', ctx)
    const coreStops = await runHandlers(corePi, 'session_stop', ctx)
    expect(testingStops.filter(result => isContinuation(result))).toHaveLength(0)
    expect([...testingStops, ...coreStops].filter(result => isContinuation(result))).toHaveLength(1)
  })

  it('fails closed for future pending state and only blocks tools when running standalone', async () => {
    const standalone = new SharedFakePi()
    standalone.registerAs('testing', () => registerTestingEnhancer(standalone))
    standalone.entries.push(coreRouteEntry('route:future:1'))
    standalone.entries.push(futurePendingStateEntry('route:future:1'))
    const standaloneCtx = context(standalone)

    await runHandlers(standalone, 'session_start', standaloneCtx)
    const standaloneStops = await runHandlers(standalone, 'session_stop', standaloneCtx)
    expect(standaloneStops).toContainEqual(expect.objectContaining({
      continue: true,
      additionalContext: expect.stringContaining('OMP_TEST_GATE_TERMINAL')
    }))
    expect(await runHandlers(standalone, 'tool_call', standaloneCtx)).toContainEqual(expect.objectContaining({
      block: true,
      reason: expect.stringContaining('OMP_TEST_GATE_TERMINAL')
    }))

    const sharedEvents = {}
    const testingPi = new SharedFakePi(sharedEvents)
    const corePi = new SharedFakePi(sharedEvents)
    testingPi.registerAs('testing', () => registerTestingEnhancer(testingPi))
    corePi.registerAs('core', () => registerCoreOwnerStub(corePi))
    testingPi.entries.push(coreRouteEntry('route:future:1'))
    testingPi.entries.push(futurePendingStateEntry('route:future:1'))
    const sharedCtx = context(testingPi)

    await runHandlers(testingPi, 'session_start', sharedCtx)
    expect(await runHandlers(testingPi, 'tool_call', sharedCtx)).toEqual([undefined])
  })
})

function registerCoreOwnerStub(pi: SharedFakePi): void {
  Object.defineProperty(pi.events, CORE_GATE_OWNER_SYMBOL, {
    value: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 2 }
  })
  pi.on('session_stop', () => ({ continue: true, additionalContext: 'core owns completion' }))
}

async function runHandlers(pi: SharedFakePi, name: string, ctx: ExtensionToolContext): Promise<unknown[]> {
  const results: unknown[] = []
  for (const item of pi.eventHandlers.filter(handler => handler.event === name)) {
    results.push(await item.handler({}, ctx))
  }
  return results
}

function isContinuation(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'continue' in value && value.continue === true
}

function context(pi: SharedFakePi): ExtensionToolContext {
  return {
    cwd: process.cwd(),
    hasUI: false,
    ui: { notify: () => undefined },
    sessionManager: { getBranch: () => pi.entries }
  }
}

function coreRouteEntry(routeId: string): { type: 'custom'; customType: string; data: unknown } {
  return {
    type: 'custom',
    customType: CORE_STATE_ENTRY,
    data: { routeId, gateController: { routeId } }
  }
}

function futurePendingStateEntry(routeId: string): { type: 'custom'; customType: string; data: unknown } {
  return {
    type: 'custom',
    customType: TESTING_STATE_ENTRY,
    data: {
      schemaVersion: 999,
      pendingGate: true,
      routeId,
      lastAnalyzeRunId: 'future-run',
      lastTargets: [],
      lastGateResults: [],
      evidenceRevision: 1,
      standaloneRecovery: {
        repairUsed: 0,
        repairMax: Number.MAX_SAFE_INTEGER,
        terminalUsed: 0,
        terminalMax: Number.MAX_SAFE_INTEGER,
        lastRepairFingerprint: null,
        terminalFingerprint: null
      }
    }
  }
}

function entriesOfType(pi: SharedFakePi, customType: string): Array<{ type: string; customType: string; data: unknown }> {
  return pi.entries.filter(entry => entry.customType === customType)
}

function latestEntry(pi: SharedFakePi, customType: string): unknown {
  return entriesOfType(pi, customType).at(-1)?.data
}

function passingGateParams(sourceFile = 'src/user/UserService.ts', symbolName = 'UserService') {
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
