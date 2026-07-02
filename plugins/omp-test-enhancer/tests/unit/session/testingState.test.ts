import { describe, expect, it } from 'vitest'
import {
  TESTING_STATE_ENTRY,
  createInitialTestingState,
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
      pendingGate: false,
      lastTargets: [],
      lastGateResults: []
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

  it('transitions from pending to finished and records report markdown', () => {
    const pending = markGatePending(createInitialTestingState(), [target])
    expect(pending.pendingGate).toBe(true)
    expect(pending.lastTargets).toEqual([target])

    const finished = markGateFinished(pending, [passedGate, browserGate])
    expect(finished.pendingGate).toBe(false)
    expect(finished.lastGateResults).toEqual([passedGate, browserGate])

    expect(markReportGenerated(finished, '# report')).toMatchObject({
      lastReportMarkdown: '# report'
    })
  })
})
