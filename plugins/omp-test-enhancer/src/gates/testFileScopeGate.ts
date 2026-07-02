import type { CandidateTest, GateResult } from '../types.js'

export interface EvaluateTestFileScopeGateInput {
  candidate: CandidateTest
}

export function evaluateTestFileScopeGate(input: EvaluateTestFileScopeGateInput): GateResult[] {
  const blockers: GateResult[] = []

  for (const file of input.candidate.files) {
    if (isTestFilePath(file.path)) continue

    blockers.push({
      gate: 'test-file-scope',
      passed: false,
      severity: 'blocker',
      summary: 'Candidate modifies non-test files.',
      evidence: { file: file.path },
      repairHint: 'Only change test files in this workflow. If production code must change, stop and ask for a separate implementation task.'
    })
  }

  if (blockers.length > 0) return blockers

  return [{
    gate: 'test-file-scope',
    passed: true,
    severity: 'blocker',
    summary: 'Candidate changes are limited to test files.',
    evidence: {}
  }]
}

function isTestFilePath(path: string): boolean {
  return /\.(test|spec)\.[cm]?[tj]sx?$/.test(path) || /(^|\/)__tests__\//.test(path) || /(^|\/)tests\//.test(path)
}
