import { describe, expect, it } from 'vitest'
import { evaluateIndirectTestGate } from '../../../src/gates/indirectTestGate.js'
import type { CandidateTest, ChangedTarget } from '../../../src/types.js'

function target(kind: ChangedTarget['kind'], id = 'target-1'): ChangedTarget {
  return {
    id,
    sourceFile: 'src/user/UserService.ts',
    symbolName: 'UserService',
    kind,
    risk: 'medium'
  }
}

function candidate(content: string): CandidateTest {
  return {
    id: 'candidate-1',
    targetId: 'target-1',
    files: [
      {
        path: 'src/user/UserService.test.ts',
        action: 'modify',
        content
      }
    ]
  }
}

describe('evaluateIndirectTestGate', () => {
  it('reports missing changed targets as an advisory finding', () => {
    const result = evaluateIndirectTestGate({
      targets: [],
      candidate: candidate("expect(result).toBe('ok')")
    })

    expect(result).toEqual([{
      gate: 'indirect-test',
      passed: false,
      severity: 'critical',
      summary: 'No changed targets supplied for indirect-test gate.',
      evidence: { candidateId: 'candidate-1' },
      repairHint: 'Report that target analysis was not observed; use omp_test_analyze once when that evidence would improve the review.'
    }])
  })

  it('reports a candidate target id that is absent from the changed targets', () => {
    const value = candidate("expect(result).toBe('ok')")
    value.targetId = 'missing-target'

    expect(evaluateIndirectTestGate({
      targets: [target('service')],
      candidate: value
    })).toEqual([{
      gate: 'indirect-test',
      passed: false,
      severity: 'critical',
      summary: 'Candidate target was not found in changed targets.',
      evidence: {
        candidateId: 'candidate-1',
        targetId: 'missing-target',
        availableTargetIds: ['target-1']
      },
      repairHint: 'Use a target id returned by omp_test_analyze before reviewing the candidate tests.'
    }])
  })

  it('allows direct tests for public pure functions', () => {
    const result = evaluateIndirectTestGate({
      targets: [target('pure-function')],
      candidate: candidate("import { add } from './add'\nexpect(add(1, 2)).toBe(3)")
    })

    expect(result).toEqual([
      expect.objectContaining({ gate: 'indirect-test', passed: true })
    ])
  })

  it('evaluates only the target selected by candidate.targetId', () => {
    const value = candidate("import { add } from '../internal/add'\nexpect(add(1, 2)).toBe(3)")
    value.targetId = 'pure-target'

    expect(evaluateIndirectTestGate({
      targets: [target('service', 'service-target'), target('pure-function', 'pure-target')],
      candidate: value
    })).toEqual([
      expect.objectContaining({ gate: 'indirect-test', passed: true })
    ])
  })

  it('does not duplicate findings for unrelated additional targets', () => {
    const value = candidate("import { helper } from '../internal/helper'\nexpect(helper()).toBe('ok')")
    value.targetId = 'selected-service'

    const result = evaluateIndirectTestGate({
      targets: [target('service', 'selected-service'), target('service', 'other-service')],
      candidate: value
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(expect.objectContaining({
      gate: 'indirect-test',
      passed: false,
      summary: 'Test imports private or internal implementation details.'
    }))
  })

  it('allows direct tests for parser validator and formatter targets', () => {
    for (const kind of ['parser', 'validator', 'formatter'] as const) {
      const result = evaluateIndirectTestGate({
        targets: [target(kind)],
        candidate: candidate("import { parseRaw } from '../internal/parseRaw'\nexpect(parseRaw()).toBe('ok')")
      })

      expect(result).toEqual([
        expect.objectContaining({ gate: 'indirect-test', passed: true })
      ])
    }
  })

  it('rejects service tests importing internal implementation files', () => {
    const result = evaluateIndirectTestGate({
      targets: [target('service')],
      candidate: candidate("import { buildQuery } from '../internal/buildQuery'\nexpect(buildQuery()).toBe('select 1')")
    })

    expect(result[0]).toEqual(expect.objectContaining({
      gate: 'indirect-test',
      passed: false,
      severity: 'critical'
    }))
  })

  it('rejects CommonJS and dynamic internal imports for indirect targets', () => {
    for (const content of [
      "const helper = require('../internal/helper')\nexpect(helper()).toBe('ok')",
      "const helper = await import('../private/helper')\nexpect(helper.default()).toBe('ok')"
    ]) {
      const result = evaluateIndirectTestGate({
        targets: [target('service')],
        candidate: candidate(content)
      })

      expect(result[0]).toEqual(expect.objectContaining({
        gate: 'indirect-test',
        passed: false,
        summary: 'Test imports private or internal implementation details.'
      }))
    }
  })

  it('rejects tests that only assert internal mock calls', () => {
    const result = evaluateIndirectTestGate({
      targets: [target('service')],
      candidate: candidate("expect(fetchUser).toHaveBeenCalledWith('u1')")
    })

    expect(result[0]).toEqual(expect.objectContaining({
      gate: 'indirect-test',
      passed: false,
      repairHint: expect.stringContaining('public behavior')
    }))
  })

  it('allows mock call assertions when paired with public behavior assertions', () => {
    const result = evaluateIndirectTestGate({
      targets: [target('service')],
      candidate: candidate("expect(fetchUser).toHaveBeenCalledWith('u1')\nexpect(screen.getByText('Ada')).toBeVisible()")
    })

    expect(result).toEqual([
      expect.objectContaining({ gate: 'indirect-test', passed: true })
    ])
  })

  it('rejects component tests that inspect component state', () => {
    const result = evaluateIndirectTestGate({
      targets: [target('react-component')],
      candidate: candidate("expect(wrapper.state('open')).toBe(true)")
    })

    expect(result[0]).toEqual(expect.objectContaining({
      gate: 'indirect-test',
      passed: false
    }))
  })
})
