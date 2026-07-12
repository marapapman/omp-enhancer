import type { CandidateTest, GateResult } from '../types.js'

export interface EvaluateTestFileScopeGateInput {
  candidate: CandidateTest
  severity?: GateResult['severity']
}

export function evaluateTestFileScopeGate(input: EvaluateTestFileScopeGateInput): GateResult[] {
  const findings: GateResult[] = []
  const severity = input.severity ?? 'critical'

  if (input.candidate.files.length === 0) {
    return [{
      gate: 'test-file-scope',
      passed: false,
      severity,
      summary: 'Candidate includes no test files.',
      evidence: { candidateId: input.candidate.id },
      repairHint: 'Report that no changed test files were observed; provide them only if another advisory review is useful.'
    }]
  }

  for (const file of input.candidate.files) {
    if (file.missingFromWorkspace) {
      findings.push({
        gate: 'test-file-scope',
        passed: false,
        severity,
        summary: 'Candidate file is missing from the workspace.',
        evidence: { file: file.path },
        repairHint: 'Report the missing candidate file and create it only when that change is already in scope.'
      })
      continue
    }

    if (isTestFilePath(file.path)) continue

    findings.push({
      gate: 'test-file-scope',
      passed: false,
      severity,
      summary: 'Candidate modifies non-test files.',
      evidence: { file: file.path },
      repairHint: 'Report the non-test file and suggest separating implementation changes from candidate test files.'
    })
  }

  if (findings.length > 0) return findings

  return [{
    gate: 'test-file-scope',
    passed: true,
    severity,
    summary: 'Candidate changes are limited to test files.',
    evidence: {}
  }]
}

function isTestFilePath(path: string): boolean {
  return /\.(test|spec|cy)\.[cm]?[tj]sx?$/.test(path) || /(^|\/)__tests__\//.test(path) || /(^|\/)tests\//.test(path)
}
