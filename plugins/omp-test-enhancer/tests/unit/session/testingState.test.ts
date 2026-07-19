import { describe, expect, it } from 'vitest'
import {
  TESTING_EVIDENCE_ENTRY,
  TESTING_STATE_ENTRY,
  TESTING_STATE_SCHEMA_VERSION,
  buildTestingReviewEvidence,
  completeTestingReview,
  createInitialTestingReviewState,
  invalidateObservedBrowserEvidence,
  recordObservedBrowserEvidence,
  restoreTestingReviewStateFromEntries,
  scopeTestingReviewToTaskContext,
  startTestingReview
} from '../../../src/session/testingState.js'
import type { BrowserEvidence, ChangedTarget, GateResult } from '../../../src/types.js'

const target: ChangedTarget = {
  id: 'src/user/UserService.ts#UserService',
  sourceFile: 'src/user/UserService.ts',
  symbolName: 'UserService',
  kind: 'service',
  risk: 'high'
}

const readyResult: GateResult = {
  gate: 'indirect-test',
  passed: true,
  severity: 'critical',
  summary: 'Tests observe public behavior.',
  evidence: {}
}

const criticalFinding: GateResult = {
  gate: 'browser-interaction',
  passed: false,
  severity: 'critical',
  summary: 'Click could not reach the submit button.',
  evidence: { framework: 'playwright', status: 'failed', findings: [] },
  repairHint: 'Check the overlay covering the submit button.'
}

const passedBrowserEvidence: BrowserEvidence = {
  framework: 'playwright',
  status: 'passed',
  runId: 'browser-run-1',
  targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
  scenarioCount: 1,
  stepCount: 2,
  captureCount: 1,
  visualAssertionCount: 0,
  findings: []
}

describe('testing review state', () => {
  it('creates an empty task-context-scoped advisory state', () => {
    expect(createInitialTestingReviewState()).toEqual({
      schemaVersion: TESTING_STATE_SCHEMA_VERSION,
      reviewStatus: 'idle',
      lastTargets: [],
      lastReviewResults: [],
      evidenceRevision: 0
    })
  })

  it('restores the last valid current-schema state entry from a branch', () => {
    const first = startTestingReview(createInitialTestingReviewState(), [target])
    const second = completeTestingReview(first, [readyResult, criticalFinding])

    expect(restoreTestingReviewStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: first },
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: { schemaVersion: TESTING_STATE_SCHEMA_VERSION, reviewStatus: 'invalid' } },
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: second }
    ])).toEqual(second)
  })

  it('ignores obsolete persisted report markdown when restoring review state', () => {
    const state = completeTestingReview(
      startTestingReview(createInitialTestingReviewState(), [target]),
      [readyResult]
    )

    const restored = restoreTestingReviewStateFromEntries([{
      type: 'custom',
      customType: TESTING_STATE_ENTRY,
      data: { ...state, lastReportMarkdown: '# obsolete report' }
    }])

    expect(restored).not.toHaveProperty('lastReportMarkdown')
    expect(restored.lastReviewResults).toEqual([readyResult])
  })

  it('ignores malformed and pre-advisory state data', () => {
    expect(restoreTestingReviewStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: { schemaVersion: 3, reviewStatus: 'collecting', lastTargets: [], lastReviewResults: [] } },
      { type: 'message', customType: TESTING_STATE_ENTRY, data: startTestingReview(createInitialTestingReviewState(), [target]) }
    ])).toEqual(createInitialTestingReviewState())
  })

  it('migrates persisted schema-v4 route naming into task-context state', () => {
    const restored = restoreTestingReviewStateFromEntries([{
      type: 'custom',
      customType: TESTING_STATE_ENTRY,
      data: {
        schemaVersion: 4,
        reviewStatus: 'collecting',
        routeIdentity: 'route:9',
        reviewRunId: 'legacy-run',
        lastTargets: [target],
        lastReviewResults: [],
        evidenceRevision: 2,
        lastObservedTestCommand: {
          schemaVersion: 1,
          routeIdentity: 'route:9',
          commandDigest: 'a'.repeat(64),
          exitCode: 0,
          observedAt: 1234
        }
      }
    }])

    expect(restored).toMatchObject({
      schemaVersion: TESTING_STATE_SCHEMA_VERSION,
      taskContextIdentity: 'task:9',
      lastObservedTestCommand: {
        schemaVersion: 2,
        taskContextIdentity: 'task:9'
      }
    })
  })

  it('records collecting, findings, and ready diagnostics', () => {
    const collecting = startTestingReview(createInitialTestingReviewState(), [target], {
      taskContextIdentity: 'task:1',
      runId: 'test-run-1'
    })
    expect(collecting).toMatchObject({
      reviewStatus: 'collecting',
      lastTargets: [target],
      taskContextIdentity: 'task:1',
      reviewRunId: 'test-run-1',
      evidenceRevision: 1
    })

    const findings = completeTestingReview(collecting, [readyResult, criticalFinding])
    expect(findings).toMatchObject({
      reviewStatus: 'findings',
      lastReviewResults: [readyResult, criticalFinding],
      evidenceRevision: 2
    })

    const ready = completeTestingReview(findings, [readyResult])
    expect(ready).toMatchObject({ reviewStatus: 'ready', lastReviewResults: [readyResult] })
  })

  it('records, restores, and invalidates task-context-scoped observed browser evidence', () => {
    const collecting = startTestingReview(createInitialTestingReviewState(), [target], {
      taskContextIdentity: 'task:1',
      runId: 'test-run-1'
    })
    const observed = recordObservedBrowserEvidence(collecting, {
      schemaVersion: 2,
      taskContextIdentity: 'task:1',
      evidence: passedBrowserEvidence,
      observedAt: 1234
    })

    expect(restoreTestingReviewStateFromEntries([{
      type: 'custom',
      customType: TESTING_STATE_ENTRY,
      data: observed
    }], { taskContextIdentity: 'task:1', requireCurrentTaskContext: true })).toMatchObject({
      lastObservedBrowserEvidence: {
        taskContextIdentity: 'task:1',
        evidence: passedBrowserEvidence,
        observedAt: 1234
      }
    })

    const reviewed = completeTestingReview(observed, [{
      gate: 'browser-interaction',
      passed: true,
      severity: 'critical',
      summary: 'Browser interactions passed.',
      evidence: passedBrowserEvidence
    }, readyResult])
    expect(invalidateObservedBrowserEvidence(reviewed)).toMatchObject({
      reviewStatus: 'collecting',
      lastReviewResults: [readyResult]
    })
    expect(invalidateObservedBrowserEvidence(reviewed)).not.toHaveProperty('lastObservedBrowserEvidence')
  })

  it('rejects malformed persisted browser evidence and a different task context identity', () => {
    const base = startTestingReview(createInitialTestingReviewState(), [target], {
      taskContextIdentity: 'task:1',
      runId: 'test-run-1'
    })
    const malformed = {
      ...base,
      lastObservedBrowserEvidence: {
        schemaVersion: 2,
        taskContextIdentity: 'task:1',
        evidence: { ...passedBrowserEvidence, stepCount: -1 },
        observedAt: 1234
      }
    }
    expect(restoreTestingReviewStateFromEntries([{
      type: 'custom',
      customType: TESTING_STATE_ENTRY,
      data: malformed
    }])).not.toHaveProperty('lastObservedBrowserEvidence')

    expect(recordObservedBrowserEvidence(base, {
      schemaVersion: 2,
      taskContextIdentity: 'task:2',
      evidence: passedBrowserEvidence,
      observedAt: 1234
    })).toBe(base)
  })

  it('builds compact versioned advisory evidence without prose leakage', () => {
    const collecting = startTestingReview(createInitialTestingReviewState(), [target], {
      taskContextIdentity: 'task:1',
      runId: 'test-run-1'
    })
    const findings = completeTestingReview(collecting, [criticalFinding])
    const evidence = buildTestingReviewEvidence(findings, 1234)

    expect(TESTING_EVIDENCE_ENTRY).toBe('omp-testing-enhancer.evidence')
    expect(evidence).toEqual({
      schemaVersion: 3,
      taskContextIdentity: 'task:1',
      runId: 'test-run-1',
      reviewStatus: 'findings',
      criticalFindings: ['browser-interaction'],
      advisory: true,
      evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      evidenceRevision: 2,
      updatedAt: 1234
    })
    expect(JSON.stringify(evidence)).not.toContain(criticalFinding.summary)
    expect(JSON.stringify(evidence)).not.toContain(criticalFinding.repairHint)

    const repeated = buildTestingReviewEvidence(completeTestingReview(findings, [criticalFinding]), 5678)
    expect(repeated.evidenceRevision).toBe(3)
    expect(repeated.evidenceDigest).toBe(evidence.evidenceDigest)
  })

  it('does not restore observations into a different task context identity', () => {
    const oldState = completeTestingReview(
      startTestingReview(createInitialTestingReviewState(), [target], {
        taskContextIdentity: 'task:1',
        runId: 'old-run'
      }),
      [readyResult]
    )

    expect(restoreTestingReviewStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: oldState }
    ], { taskContextIdentity: 'task:2', requireCurrentTaskContext: true })).toEqual(createInitialTestingReviewState())
  })

  it('resets observations when the diagnostic task context identity changes', () => {
    const oldState = completeTestingReview(
      startTestingReview(createInitialTestingReviewState(), [target], {
        taskContextIdentity: 'task:1',
        runId: 'old-run'
      }),
      [readyResult]
    )

    expect(scopeTestingReviewToTaskContext(oldState, 'task:2')).toEqual({
      ...createInitialTestingReviewState(),
      taskContextIdentity: 'task:2'
    })
  })
})
