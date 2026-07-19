import type { CandidateTest, ChangedTarget, GateResult } from '../types.js'

export interface EvaluateIndirectTestGateInput {
  candidate: CandidateTest
  targets: ChangedTarget[]
  severity?: GateResult['severity']
}

export function evaluateIndirectTestGate(input: EvaluateIndirectTestGateInput): GateResult[] {
  const results: GateResult[] = []
  const severity = input.severity ?? 'critical'

  if (input.targets.length === 0) {
    return [{
      gate: 'indirect-test',
      passed: false,
      severity,
      summary: 'No changed targets supplied for indirect-test gate.',
      evidence: { candidateId: input.candidate.id },
      repairHint: 'Report that target analysis was not observed; use omp_test_analyze once when that evidence would improve the review.'
    }]
  }

  const target = input.targets.find(candidate => candidate.id === input.candidate.targetId)
  if (!target) {
    return [{
      gate: 'indirect-test',
      passed: false,
      severity,
      summary: 'Candidate target was not found in changed targets.',
      evidence: {
        candidateId: input.candidate.id,
        targetId: input.candidate.targetId,
        availableTargetIds: input.targets.map(candidate => candidate.id)
      },
      repairHint: 'Use a target id returned by omp_test_analyze before reviewing the candidate tests.'
    }]
  }

  for (const file of input.candidate.files) {
    if (target.kind === 'pure-function' || target.kind === 'validator' || target.kind === 'parser' || target.kind === 'formatter') continue

    const privateImport = findPrivateImport(file.content)
    if (privateImport) {
      results.push({
        gate: 'indirect-test',
        passed: false,
        severity,
        summary: 'Test imports private or internal implementation details.',
        evidence: { file: file.path, importPath: privateImport },
        repairHint: 'Test through public behavior, such as a service method, route, UI output, or returned result.'
      })
    }

    const privateAccess = findPrivateAccess(file.content)
    if (privateAccess) {
      results.push({
        gate: 'indirect-test',
        passed: false,
        severity,
        summary: 'Test accesses implementation details.',
        evidence: { file: file.path, pattern: privateAccess },
        repairHint: 'Avoid private fields, bracket access to internals, and component instance state. Assert public behavior instead.'
      })
    }

    if (hasOnlyMockCallAssertions(file.content)) {
      results.push({
        gate: 'indirect-test',
        passed: false,
        severity,
        summary: 'Test only asserts internal mock calls.',
        evidence: { file: file.path },
        repairHint: 'Add assertions on public behavior, returned values, thrown errors, DOM output, HTTP responses, or persisted state.'
      })
    }

    const stateAccess = target.kind === 'react-component'
      ? findComponentStateAccess(file.content)
      : undefined

    if (stateAccess) {
      results.push({
        gate: 'indirect-test',
        passed: false,
        severity,
        summary: 'Component test inspects implementation state.',
        evidence: { file: file.path, pattern: stateAccess },
        repairHint: 'Use user interactions and visible output instead of component internals.'
      })
    }
  }

  if (results.length > 0) return results

  return [{
    gate: 'indirect-test',
    passed: true,
    severity,
    summary: 'Tests do not rely on private implementation details.',
    evidence: {}
  }]
}


function findPrivateImport(content: string): string | undefined {
  const importPaths = [
    ...[...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]),
    ...[...content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]),
    ...[...content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1])
  ].filter((value): value is string => Boolean(value))

  return importPaths.find(path =>
    path.includes('/internal/') ||
    path.includes('/private/') ||
    /private[A-Z_./-]/i.test(path) ||
    /internal[A-Z_./-]/i.test(path)
  )
}

function findPrivateAccess(content: string): string | undefined {
  const patterns = ['._', "['private", '["private', '.instance()']
  return patterns.find(pattern => content.includes(pattern))
}

function hasOnlyMockCallAssertions(content: string): boolean {
  const assertionMethods = [...content.matchAll(/expect\s*\((?:[^()]|\([^()]*\))*\)\s*\.\s*([A-Za-z0-9_]+)/g)]
    .map(match => match[1])
    .filter((value): value is string => Boolean(value))

  if (assertionMethods.length === 0) return false

  return assertionMethods.every(method =>
    method === 'toHaveBeenCalled' ||
    method === 'toHaveBeenCalledWith' ||
    method === 'toHaveBeenCalledOnce' ||
    method === 'toHaveBeenCalledTimes' ||
    method === 'toHaveBeenLastCalledWith' ||
    method === 'toHaveBeenNthCalledWith' ||
    method === 'toHaveBeenTimes'
  )
}

function findComponentStateAccess(content: string): string | undefined {
  const patterns = ['.state', '.setState', '.instance()', 'wrapper.find(', 'component.find(']
  return patterns.find(pattern => content.includes(pattern))
}
