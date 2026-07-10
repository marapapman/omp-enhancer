import { describe, expect, it } from 'vitest'
import {
  TESTING_EVIDENCE_ENTRY,
  TESTING_STATE_ENTRY,
  TESTING_STATE_SCHEMA_VERSION,
  bindTestingStateToRoute,
  buildTestingGateEvidence,
  createInitialTestingState,
  evaluateStandaloneTestingGate,
  markGateFinished,
  markGatePending,
  markReportGenerated,
  restoreTestingStateFromEntries
} from '../../../src/session/testingState.js'
import type { ChangedTarget, GateResult } from '../../../src/types.js'

const target: ChangedTarget = {
  id: 'src/user/UserService.ts#UserService',
  sourceFile: 'src/user/UserService.ts',
  symbolName: 'UserService',
  kind: 'service',
  risk: 'high'
}

const passedGate: GateResult = {
  gate: 'indirect-test',
  passed: true,
  severity: 'blocker',
  summary: 'Tests observe public behavior.',
  evidence: {}
}

const browserGate: GateResult = {
  gate: 'browser-interaction',
  passed: false,
  severity: 'blocker',
  summary: 'Click could not reach the submit button.',
  evidence: {
    framework: 'playwright',
    status: 'failed',
    findings: []
  },
  repairHint: 'Check the overlay that blocks the submit button.'
}

describe('testingState', () => {
  it('creates an empty non-pending state', () => {
    expect(createInitialTestingState()).toEqual({
      schemaVersion: TESTING_STATE_SCHEMA_VERSION,
      pendingGate: false,
      lastTargets: [],
      lastGateResults: [],
      evidenceRevision: 0,
      standaloneRecovery: {
        repairUsed: 0,
        repairMax: 2,
        terminalUsed: 0,
        terminalMax: 1,
        lastRepairFingerprint: null,
        terminalFingerprint: null
      }
    })
  })

  it('restores the last valid state entry from a branch', () => {
    const first = markGatePending(createInitialTestingState(), [target])
    const second = markGateFinished(first, [passedGate, browserGate])

    expect(restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: first },
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: { pendingGate: 'bad' } },
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: second }
    ])).toEqual(second)
  })

  it('ignores invalid saved state data', () => {
    expect(restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: { pendingGate: true } },
      { type: 'message', customType: TESTING_STATE_ENTRY, data: markGatePending(createInitialTestingState(), [target]) }
    ])).toEqual(createInitialTestingState())
  })

  it('keeps pending after failed blocker gates and clears pending after passing gates', () => {
    const pending = markGatePending(createInitialTestingState(), [target], {
      routeId: 'route:code.dev:1',
      runId: 'test-run-1'
    })
    expect(pending.pendingGate).toBe(true)
    expect(pending.lastTargets).toEqual([target])
    expect(pending.routeId).toBe('route:code.dev:1')
    expect(pending.lastAnalyzeRunId).toBe('test-run-1')
    expect(pending.evidenceRevision).toBe(1)

    const failed = markGateFinished(pending, [passedGate, browserGate])
    expect(failed.pendingGate).toBe(true)
    expect(failed.lastGateResults).toEqual([passedGate, browserGate])
    expect(failed.evidenceRevision).toBe(2)

    const finished = markGateFinished(failed, [passedGate])
    expect(finished.pendingGate).toBe(false)
    expect(finished.lastGateResults).toEqual([passedGate])

    expect(markReportGenerated(finished, '# report')).toMatchObject({
      lastReportMarkdown: '# report'
    })
  })

  it('builds versioned gate evidence without leaking summaries into the digest', () => {
    const pending = markGatePending(createInitialTestingState(), [target], {
      routeId: 'route:code.dev:1',
      runId: 'test-run-1'
    })
    const failed = markGateFinished(pending, [browserGate])
    const evidence = buildTestingGateEvidence(failed, 1234)

    expect(TESTING_EVIDENCE_ENTRY).toBe('omp-testing-enhancer.evidence')
    expect(evidence).toEqual({
      schemaVersion: 1,
      routeId: 'route:code.dev:1',
      runId: 'test-run-1',
      status: 'failed',
      pending: true,
      passed: false,
      failed: true,
      blockers: ['browser-interaction'],
      evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      evidenceRevision: 2,
      updatedAt: 1234
    })
    expect(JSON.stringify(evidence)).not.toContain(browserGate.summary)
    expect(JSON.stringify(evidence)).not.toContain(browserGate.repairHint)

    const repeatedFailure = buildTestingGateEvidence(markGateFinished(failed, [browserGate]), 5678)
    expect(repeatedFailure.evidenceRevision).toBe(3)
    expect(repeatedFailure.evidenceDigest).toBe(evidence.evidenceDigest)
  })

  it('migrates legacy state with safe standalone recovery defaults', () => {
    const legacy = {
      pendingGate: true,
      lastAnalyzeRunId: 'legacy-run',
      lastTargets: [target],
      lastGateResults: [browserGate]
    }

    expect(restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: legacy }
    ])).toMatchObject({
      schemaVersion: TESTING_STATE_SCHEMA_VERSION,
      pendingGate: true,
      lastAnalyzeRunId: 'legacy-run',
      evidenceRevision: 0,
      standaloneRecovery: {
        repairUsed: 0,
        terminalUsed: 0,
        lastRepairFingerprint: null,
        terminalFingerprint: null
      }
    })
  })

  it('clamps persisted standalone recovery budgets to the fixed 2+1 ceiling', () => {
    const poisoned = {
      ...markGatePending(createInitialTestingState(), [target], {
        routeId: 'testing:poisoned-budget',
        runId: 'poisoned-run'
      }),
      standaloneRecovery: {
        repairUsed: Number.MAX_SAFE_INTEGER,
        repairMax: Number.MAX_SAFE_INTEGER,
        terminalUsed: Number.MAX_SAFE_INTEGER,
        terminalMax: Number.MAX_SAFE_INTEGER,
        lastRepairFingerprint: 'repair-fingerprint',
        terminalFingerprint: 'terminal-fingerprint'
      }
    }

    const restored = restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: poisoned }
    ])

    expect(restored.standaloneRecovery).toEqual({
      repairUsed: 2,
      repairMax: 2,
      terminalUsed: 1,
      terminalMax: 1,
      lastRepairFingerprint: 'repair-fingerprint',
      terminalFingerprint: 'terminal-fingerprint'
    })
    expect(evaluateStandaloneTestingGate(restored).kind).toBe('stop')

    const inflatedMaxima = {
      ...poisoned,
      standaloneRecovery: {
        ...poisoned.standaloneRecovery,
        repairUsed: 0,
        terminalUsed: 0,
        lastRepairFingerprint: null,
        terminalFingerprint: null
      }
    }
    const restoredWithUnusedBudget = restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: inflatedMaxima }
    ])
    const firstRepair = evaluateStandaloneTestingGate(restoredWithUnusedBudget)
    expect(firstRepair.kind).toBe('repair')
    const secondRepair = evaluateStandaloneTestingGate(markGatePending(firstRepair.state, [target], {
      routeId: 'testing:poisoned-budget',
      runId: 'poisoned-run-2'
    }))
    expect(secondRepair.kind).toBe('repair')
    const terminal = evaluateStandaloneTestingGate(markGatePending(secondRepair.state, [target], {
      routeId: 'testing:poisoned-budget',
      runId: 'poisoned-run-3'
    }))
    expect(terminal.kind).toBe('terminal')
  })

  it('restores unsupported future pending state as terminal-only instead of releasing it', () => {
    const restored = restoreTestingStateFromEntries([
      {
        type: 'custom',
        customType: TESTING_STATE_ENTRY,
        data: {
          schemaVersion: TESTING_STATE_SCHEMA_VERSION + 100,
          pendingGate: true,
          routeId: 'testing:future-schema',
          lastAnalyzeRunId: 'future-run',
          lastTargets: [target],
          lastGateResults: [browserGate],
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
    ])

    expect(restored).toMatchObject({
      schemaVersion: TESTING_STATE_SCHEMA_VERSION,
      pendingGate: true,
      routeId: 'testing:future-schema',
      lastAnalyzeRunId: 'future-run',
      standaloneRecovery: {
        repairUsed: 2,
        repairMax: 2,
        terminalUsed: 0,
        terminalMax: 1
      }
    })
    expect(evaluateStandaloneTestingGate(restored).kind).toBe('terminal')
  })

  it('does not restore a completed state from a different core route', () => {
    const oldState = markGateFinished(
      markGatePending(createInitialTestingState(), [target], {
        routeId: 'route:old:1',
        runId: 'old-run'
      }),
      [passedGate]
    )

    expect(restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: oldState }
    ], { routeId: 'route:new:2', requireCurrentRouteEvidence: true })).toEqual(createInitialTestingState())
  })

  it('drops route-scoped evidence instead of rebinding it to a new core route', () => {
    const oldState = markGateFinished(
      markGatePending(createInitialTestingState(), [target], {
        routeId: 'route:old:1',
        runId: 'old-run'
      }),
      [passedGate]
    )

    expect(bindTestingStateToRoute(oldState, 'route:new:2')).toEqual({
      ...createInitialTestingState(),
      routeId: 'route:new:2'
    })
  })

  it('persists the standalone circuit breaker across state restoration', () => {
    const failed = markGateFinished(
      markGatePending(createInitialTestingState(), [target], {
        routeId: 'testing:run-1',
        runId: 'run-1'
      }),
      [browserGate]
    )
    const repair = evaluateStandaloneTestingGate(failed)
    expect(repair.kind).toBe('repair')

    const restoredAfterRepair = restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: repair.state }
    ])
    const terminal = evaluateStandaloneTestingGate(restoredAfterRepair)
    expect(terminal.kind).toBe('terminal')

    const restoredAfterTerminal = restoreTestingStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: terminal.state }
    ])
    expect(evaluateStandaloneTestingGate(restoredAfterTerminal).kind).toBe('stop')
  })

  it('keeps the standalone recovery budget when analyze creates a new run in the same route', () => {
    const firstFailure = markGateFinished(
      markGatePending(createInitialTestingState(), [target], {
        routeId: 'testing:route-1',
        runId: 'run-1'
      }),
      [browserGate]
    )
    const firstRepair = evaluateStandaloneTestingGate(firstFailure)
    expect(firstRepair.kind).toBe('repair')

    const secondFailure = markGateFinished(
      markGatePending(firstRepair.state, [target], {
        routeId: 'testing:route-1',
        runId: 'run-2'
      }),
      [browserGate]
    )
    expect(secondFailure.standaloneRecovery.repairUsed).toBe(1)
    const secondRepair = evaluateStandaloneTestingGate(secondFailure)
    expect(secondRepair.kind).toBe('repair')
    expect(secondRepair.state.standaloneRecovery.repairUsed).toBe(2)

    const thirdFailure = markGateFinished(
      markGatePending(secondRepair.state, [target], {
        routeId: 'testing:route-1',
        runId: 'run-3'
      }),
      [browserGate]
    )
    expect(evaluateStandaloneTestingGate(thirdFailure).kind).toBe('terminal')
  })
})
