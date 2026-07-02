import type { CandidateTest, ChangedTarget, GateResult } from '../types.js'

export interface EvaluateIndirectTestGateInput {
  candidate: CandidateTest
  targets: ChangedTarget[]
}

export function evaluateIndirectTestGate(input: EvaluateIndirectTestGateInput): GateResult[] {
  const results: GateResult[] = []

  for (const file of input.candidate.files) {
    for (const target of input.targets) {
      if (target.kind === 'pure-function' || target.kind === 'validator' || target.kind === 'parser' || target.kind === 'formatter') continue

      const privateImport = findPrivateImport(file.content)
      if (privateImport) {
        results.push({
          gate: 'indirect-test',
          passed: false,
          severity: 'blocker',
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
          severity: 'blocker',
          summary: 'Test accesses implementation details.',
          evidence: { file: file.path, pattern: privateAccess },
          repairHint: 'Avoid private fields, bracket access to internals, and component instance state. Assert public behavior instead.'
        })
      }

      if (hasOnlyMockCallAssertions(file.content)) {
        results.push({
          gate: 'indirect-test',
          passed: false,
          severity: 'blocker',
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
          severity: 'blocker',
          summary: 'Component test inspects implementation state.',
          evidence: { file: file.path, pattern: stateAccess },
          repairHint: 'Use user interactions and visible output instead of component internals.'
        })
      }
    }
  }

  if (results.length > 0) return results

  return [{
    gate: 'indirect-test',
    passed: true,
    severity: 'blocker',
    summary: 'Tests do not rely on blocked implementation details.',
    evidence: {}
  }]
}


function findPrivateImport(content: string): string | undefined {
  const importPaths = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map(match => match[1])
    .filter((value): value is string => Boolean(value))

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
  const assertions = content.match(/expect\s*\([^)]*\)\s*\.\s*([A-Za-z0-9_]+)/g) ?? []

  if (assertions.length === 0) return false

  return assertions.every(assertion =>
    assertion.includes('toHaveBeenCalled') ||
    assertion.includes('toHaveBeenCalledWith') ||
    assertion.includes('toHaveBeenTimes')
  )
}

function findComponentStateAccess(content: string): string | undefined {
  const patterns = ['.state', '.setState', '.instance()', 'wrapper.find(', 'component.find(']
  return patterns.find(pattern => content.includes(pattern))
}
