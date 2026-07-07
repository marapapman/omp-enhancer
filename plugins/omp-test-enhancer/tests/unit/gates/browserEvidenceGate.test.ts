import { describe, expect, it } from 'vitest'
import { evaluateBrowserEvidenceGate } from '../../../src/gates/browserEvidenceGate.js'
import type { BrowserEvidence } from '../../../src/types.js'

const passedEvidence: BrowserEvidence = {
  framework: 'playwright',
  status: 'passed',
  runId: 'browser-run',
  baseUrl: 'http://localhost:5173',
  findings: []
}

describe('evaluateBrowserEvidenceGate', () => {
  it('returns no results when browser evidence is absent', () => {
    expect(evaluateBrowserEvidenceGate(undefined)).toEqual([])
  })

  it('blocks missing browser evidence when frontend evidence is required', () => {
    expect(evaluateBrowserEvidenceGate(undefined, { required: true, severity: 'blocker', targetIds: ['src/ui/LoginForm.tsx#LoginForm'] })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'blocker',
      summary: 'Browser evidence is required for frontend targets.',
      evidence: { targetIds: ['src/ui/LoginForm.tsx#LoginForm'] },
      repairHint: 'Run omp_test_browser_check and pass its browserEvidence into omp_test_gate for frontend targets.'
    }])
  })

  it('marks required missing browser evidence as passed when the configured severity is warning', () => {
    expect(evaluateBrowserEvidenceGate(undefined, { required: true, severity: 'warning', targetIds: ['src/ui/LoginForm.tsx#LoginForm'] })).toEqual([{
      gate: 'browser-interaction',
      passed: true,
      severity: 'warning',
      summary: 'Browser evidence is required for frontend targets.',
      evidence: { targetIds: ['src/ui/LoginForm.tsx#LoginForm'] },
      repairHint: 'Run omp_test_browser_check and pass its browserEvidence into omp_test_gate for frontend targets.'
    }])
  })

  it('passes interaction and visual gates for clean browser evidence', () => {
    expect(evaluateBrowserEvidenceGate(passedEvidence)).toEqual([
      {
        gate: 'browser-interaction',
        passed: true,
        severity: 'blocker',
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

  it('warns but does not block when browser evidence was explicitly skipped', () => {
    const skipped: BrowserEvidence = {
      ...passedEvidence,
      status: 'skipped'
    }

    expect(evaluateBrowserEvidenceGate(skipped)).toEqual([{
      gate: 'browser-interaction',
      passed: true,
      severity: 'warning',
      summary: 'Browser check was skipped.',
      evidence: skipped,
      repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
    }])
  })

  it('blocks skipped browser evidence when frontend evidence is required as blocker', () => {
    const skipped: BrowserEvidence = {
      ...passedEvidence,
      status: 'skipped'
    }

    expect(evaluateBrowserEvidenceGate(skipped, { required: true, severity: 'blocker' })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'blocker',
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
        passed: true,
        severity: 'warning',
        category: 'setup',
        summary: 'Playwright is not installed.',
        evidence: { reason: 'missing optional dependency' }
      }]
    }

    expect(evaluateBrowserEvidenceGate(skipped, { required: true, severity: 'blocker' })).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'blocker',
      summary: 'Browser check was skipped.',
      evidence: skipped,
      repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
    }])
  })

  it('blocks failed browser evidence when no structured finding was supplied', () => {
    const failed: BrowserEvidence = {
      ...passedEvidence,
      status: 'failed'
    }

    expect(evaluateBrowserEvidenceGate(failed)).toEqual([{
      gate: 'browser-interaction',
      passed: false,
      severity: 'blocker',
      summary: 'Browser check failed without structured findings.',
      evidence: failed,
      repairHint: 'Re-run browser evidence collection and include action, console, network, or visual findings.'
    }])
  })

  it('uses structured findings even when evidence status is passed', () => {
    const evidence: BrowserEvidence = {
      ...passedEvidence,
      findings: [{
        gate: 'browser-visual',
        passed: false,
        severity: 'blocker',
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
      severity: 'blocker',
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
