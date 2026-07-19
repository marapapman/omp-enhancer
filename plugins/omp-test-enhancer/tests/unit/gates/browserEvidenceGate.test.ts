import { describe, expect, it } from 'vitest'
import { evaluateBrowserEvidenceGate } from '../../../src/gates/browserEvidenceGate.js'
import type { BrowserEvidence } from '../../../src/types.js'

const passedEvidence: BrowserEvidence = {
  framework: 'playwright',
  status: 'passed',
  runId: 'browser-run',
  baseUrl: 'http://localhost:5173',
  targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
  scenarioCount: 1,
  stepCount: 2,
  captureCount: 1,
  visualAssertionCount: 1,
  findings: []
}

describe('evaluateBrowserEvidenceGate', () => {
  it('returns no results when browser evidence is absent', () => {
    expect(evaluateBrowserEvidenceGate(undefined)).toEqual([])
  })

  it('blocks missing browser evidence when frontend evidence is required', () => {
    expect(evaluateBrowserEvidenceGate(undefined, { required: true, severity: 'critical', targetIds: ['src/ui/LoginForm.tsx#LoginForm'] })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'critical',
      summary: 'Browser evidence is required for frontend targets.',
      evidence: { targetIds: ['src/ui/LoginForm.tsx#LoginForm'] },
      repairHint: 'Run omp_test_browser_check in the current task context before omp_test_review for frontend targets.'
    }])
  })

  it('keeps required missing browser evidence factually failed when severity is warning', () => {
    expect(evaluateBrowserEvidenceGate(undefined, { required: true, severity: 'warning', targetIds: ['src/ui/LoginForm.tsx#LoginForm'] })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'warning',
      summary: 'Browser evidence is required for frontend targets.',
      evidence: { targetIds: ['src/ui/LoginForm.tsx#LoginForm'] },
      repairHint: 'Run omp_test_browser_check in the current task context before omp_test_review for frontend targets.'
    }])
  })

  it('passes interaction and visual gates for clean browser evidence', () => {
    expect(evaluateBrowserEvidenceGate(passedEvidence)).toEqual([
      {
        gate: 'browser-interaction',
        passed: true,
        severity: 'critical',
        summary: 'Browser interactions passed.',
        evidence: passedEvidence
      },
      {
        gate: 'browser-visual',
        passed: true,
        severity: 'warning',
        summary: 'Browser visual checks passed.',
        evidence: passedEvidence
      }
    ])
  })

  it('does not pass interaction when no scenario executed', () => {
    const evidence: BrowserEvidence = {
      ...passedEvidence,
      scenarioCount: 0,
      stepCount: 0,
      captureCount: 0,
      visualAssertionCount: 0
    }

    expect(evaluateBrowserEvidenceGate(evidence)).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'critical',
      summary: 'Browser check did not execute any scenarios.',
      evidence: { scenarioCount: 0, stepCount: 0, captureCount: 0, visualAssertionCount: 0, runId: 'browser-run' },
      repairHint: 'Run at least one browser scenario with at least one interaction step in the current task context.'
    }])
  })

  it('does not pass interaction when scenarios contain no executed steps', () => {
    const evidence: BrowserEvidence = {
      ...passedEvidence,
      stepCount: 0,
      captureCount: 0,
      visualAssertionCount: 0
    }

    expect(evaluateBrowserEvidenceGate(evidence)).toEqual([expect.objectContaining({
      gate: 'browser-interaction',
      passed: false,
      summary: 'Browser check did not execute any interaction steps.'
    })])
  })

  it('omits a visual PASS when captures ran without a visual assertion', () => {
    const evidence: BrowserEvidence = {
      ...passedEvidence,
      captureCount: 2,
      visualAssertionCount: 0
    }

    expect(evaluateBrowserEvidenceGate(evidence)).toEqual([{
      gate: 'browser-interaction',
      passed: true,
      severity: 'critical',
      summary: 'Browser interactions passed.',
      evidence
    }])
  })

  it('rejects evidence that does not cover every reviewed frontend target', () => {
    expect(evaluateBrowserEvidenceGate({
      ...passedEvidence,
      targetIds: ['src/ui/LoginForm.tsx#LoginForm']
    }, {
      required: true,
      targetIds: ['src/ui/LoginForm.tsx#LoginForm', 'src/ui/Nav.tsx#Nav']
    })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'critical',
      summary: 'Browser evidence does not cover all reviewed frontend targets.',
      evidence: {
        requiredTargetIds: ['src/ui/LoginForm.tsx#LoginForm', 'src/ui/Nav.tsx#Nav'],
        observedTargetIds: ['src/ui/LoginForm.tsx#LoginForm'],
        missingTargetIds: ['src/ui/Nav.tsx#Nav']
      },
      repairHint: 'Run omp_test_browser_check with targetIds covering every reviewed frontend target.'
    }])
  })

  it('reports a warning when browser evidence was explicitly skipped', () => {
    const skipped: BrowserEvidence = {
      ...passedEvidence,
      status: 'skipped'
    }

    expect(evaluateBrowserEvidenceGate(skipped)).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'warning',
      summary: 'Browser check was skipped.',
      evidence: skipped,
      repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
    }])
  })

  it('reports skipped browser evidence as critical when frontend evidence is required', () => {
    const skipped: BrowserEvidence = {
      ...passedEvidence,
      status: 'skipped'
    }

    expect(evaluateBrowserEvidenceGate(skipped, { required: true, severity: 'critical' })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'critical',
      summary: 'Browser check was skipped.',
      evidence: skipped,
      repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
    }])
  })

  it('blocks skipped browser evidence with fallback findings when frontend evidence is required', () => {
    const skipped: BrowserEvidence = {
      ...passedEvidence,
      status: 'skipped',
      findings: [{
        gate: 'browser-interaction',
        passed: false,
        severity: 'warning',
        category: 'setup',
        summary: 'Playwright is not installed.',
        evidence: { reason: 'missing optional dependency' }
      }]
    }

    expect(evaluateBrowserEvidenceGate(skipped, { required: true, severity: 'critical' })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'critical',
      summary: 'Browser check was skipped.',
      evidence: skipped,
      repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
    }])
  })

  it('reports failed browser evidence when no structured finding was supplied', () => {
    const failed: BrowserEvidence = {
      ...passedEvidence,
      status: 'failed'
    }

    expect(evaluateBrowserEvidenceGate(failed)).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'critical',
      summary: 'Browser check failed without a failing structured finding.',
      evidence: failed,
      repairHint: 'Report the browser execution failure and collect a structured failing observation before accepting the review.'
    }])
  })

  it('adds a generic failure when failed evidence contains only passed findings', () => {
    const failed: BrowserEvidence = {
      ...passedEvidence,
      status: 'failed',
      findings: [{
        gate: 'browser-interaction',
        passed: true,
        severity: 'warning',
        category: 'setup',
        summary: 'A non-failing note.',
        evidence: {}
      }]
    }

    expect(evaluateBrowserEvidenceGate(failed)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gate: 'browser-interaction',
        passed: false,
        summary: 'Browser check failed without a failing structured finding.'
      })
    ]))
  })

  it('keeps the generic failed-status result when execution counts are also empty', () => {
    const failed: BrowserEvidence = {
      ...passedEvidence,
      status: 'failed',
      scenarioCount: 0,
      stepCount: 0,
      captureCount: 0,
      visualAssertionCount: 0,
      findings: []
    }

    expect(evaluateBrowserEvidenceGate(failed)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        passed: false,
        summary: 'Browser check failed without a failing structured finding.'
      }),
      expect.objectContaining({
        passed: false,
        summary: 'Browser check did not execute any scenarios.'
      })
    ]))
  })

  it('uses structured findings even when evidence status is passed', () => {
    const evidence: BrowserEvidence = {
      ...passedEvidence,
      findings: [{
        gate: 'browser-visual',
        passed: false,
        severity: 'critical',
        category: 'visual-diff',
        summary: 'Diff exceeded threshold.',
        evidence: { diffRatio: 0.04, threshold: 0.01 },
        repairHint: 'Inspect the diff before accepting the change.',
        artifacts: { diffImagePath: '.omp/diff.png' }
      }]
    }

    expect(evaluateBrowserEvidenceGate(evidence)).toEqual([{
      gate: 'browser-visual',
      passed: false,
      severity: 'critical',
      summary: 'Diff exceeded threshold.',
      evidence: {
        category: 'visual-diff',
        details: { diffRatio: 0.04, threshold: 0.01 },
        artifacts: { diffImagePath: '.omp/diff.png' }
      },
      repairHint: 'Inspect the diff before accepting the change.'
    }])
  })
})
