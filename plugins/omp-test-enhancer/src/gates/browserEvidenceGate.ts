import type { BrowserEvidence, BrowserFinding, GateResult } from '../types.js'

export interface EvaluateBrowserEvidenceGateOptions {
  required?: boolean
  severity?: GateResult['severity']
  targetIds?: string[]
}

export function evaluateBrowserEvidenceGate(evidence: BrowserEvidence | undefined, options: EvaluateBrowserEvidenceGateOptions = {}): GateResult[] {
  const severity = options.severity ?? 'blocker'

  if (!evidence) {
    if (!options.required) return []
    return [{
      gate: 'browser-interaction',
      passed: severity === 'warning',
      severity,
      summary: 'Browser evidence is required for frontend targets.',
      evidence: { targetIds: options.targetIds ?? [] },
      repairHint: 'Run omp_test_browser_check and pass its browserEvidence into omp_test_gate for frontend targets.'
    }]
  }

  if (evidence.findings.length > 0) {
    return evidence.findings.map(findingToGateResult)
  }

  if (evidence.status === 'passed') {
    return [
      { gate: 'browser-interaction', passed: true, severity: 'blocker', summary: 'Browser interactions passed.', evidence },
      { gate: 'browser-visual', passed: true, severity: 'warning', summary: 'Browser visual checks passed.', evidence }
    ]
  }

  if (evidence.status === 'skipped') {
    const skippedSeverity = options.required ? severity : 'warning'
    return [{
      gate: 'browser-interaction',
      passed: skippedSeverity === 'warning',
      severity: skippedSeverity,
      summary: 'Browser check was skipped.',
      evidence,
      repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
    }]
  }

  return [{
    gate: 'browser-interaction',
    passed: false,
    severity: 'blocker',
    summary: 'Browser check failed without structured findings.',
    evidence,
    repairHint: 'Re-run browser evidence collection and include action, console, network, or visual findings.'
  }]
}

function findingToGateResult(finding: BrowserFinding): GateResult {
  return {
    gate: finding.gate,
    passed: finding.passed,
    severity: finding.severity,
    summary: finding.summary,
    evidence: {
      category: finding.category,
      details: finding.evidence,
      artifacts: finding.artifacts
    },
    ...(finding.repairHint ? { repairHint: finding.repairHint } : {})
  }
}
