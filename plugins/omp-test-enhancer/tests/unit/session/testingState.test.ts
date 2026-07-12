import { describe, expect, it } from 'vitest'
import {
  TESTING_EVIDENCE_ENTRY,
  TESTING_STATE_ENTRY,
  TESTING_STATE_SCHEMA_VERSION,
  buildTestingReviewEvidence,
  completeTestingReview,
  createInitialTestingReviewState,
  recordTestingReport,
  restoreTestingReviewStateFromEntries,
  scopeTestingReviewToRoute,
  startTestingReview
} from '../../../src/session/testingState.js'
import type { ChangedTarget, GateResult } from '../../../src/types.js'

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

describe('testing review state', () => {
  it('creates an empty route-scoped advisory state', () => {
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

  it('ignores malformed and pre-advisory state data', () => {
    expect(restoreTestingReviewStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: { schemaVersion: 3, reviewStatus: 'collecting', lastTargets: [], lastReviewResults: [] } },
      { type: 'message', customType: TESTING_STATE_ENTRY, data: startTestingReview(createInitialTestingReviewState(), [target]) }
    ])).toEqual(createInitialTestingReviewState())
  })

  it('records collecting, findings, ready, and report diagnostics', () => {
    const collecting = startTestingReview(createInitialTestingReviewState(), [target], {
      routeIdentity: 'route:1',
      runId: 'test-run-1'
    })
    expect(collecting).toMatchObject({
      reviewStatus: 'collecting',
      lastTargets: [target],
      routeIdentity: 'route:1',
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
    expect(recordTestingReport(ready, '# report')).toMatchObject({ lastReportMarkdown: '# report' })
  })

  it('builds compact versioned advisory evidence without prose leakage', () => {
    const collecting = startTestingReview(createInitialTestingReviewState(), [target], {
      routeIdentity: 'route:1',
      runId: 'test-run-1'
    })
    const findings = completeTestingReview(collecting, [criticalFinding])
    const evidence = buildTestingReviewEvidence(findings, 1234)

    expect(TESTING_EVIDENCE_ENTRY).toBe('omp-testing-enhancer.evidence')
    expect(evidence).toEqual({
      schemaVersion: 2,
      routeIdentity: 'route:1',
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

  it('does not restore observations into a different route identity', () => {
    const oldState = completeTestingReview(
      startTestingReview(createInitialTestingReviewState(), [target], {
        routeIdentity: 'route:1',
        runId: 'old-run'
      }),
      [readyResult]
    )

    expect(restoreTestingReviewStateFromEntries([
      { type: 'custom', customType: TESTING_STATE_ENTRY, data: oldState }
    ], { routeIdentity: 'route:2', requireCurrentRoute: true })).toEqual(createInitialTestingReviewState())
  })

  it('resets observations when the diagnostic route identity changes', () => {
    const oldState = completeTestingReview(
      startTestingReview(createInitialTestingReviewState(), [target], {
        routeIdentity: 'route:1',
        runId: 'old-run'
      }),
      [readyResult]
    )

    expect(scopeTestingReviewToRoute(oldState, 'route:2')).toEqual({
      ...createInitialTestingReviewState(),
      routeIdentity: 'route:2'
    })
  })
})
