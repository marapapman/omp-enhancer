import { describe, expect, it } from 'vitest'
import { evaluateIndirectTestGate } from '../../../src/gates/indirectTestGate.js'
import type { CandidateTest, ChangedTarget } from '../../../src/types.js'

function target(kind: ChangedTarget['kind']): ChangedTarget {
  return {
    id: 'target-1',
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
  it('allows direct tests for public pure functions', () => {
    const result = evaluateIndirectTestGate({
      targets: [target('pure-function')],
      candidate: candidate("import { add } from './add'\nexpect(add(1, 2)).toBe(3)")
    })

    expect(result).toEqual([
      expect.objectContaining({ gate: 'indirect-test', passed: true })
    ])
  })

  it('rejects service tests importing internal implementation files', () => {
    const result = evaluateIndirectTestGate({
      targets: [target('service')],
      candidate: candidate("import { buildQuery } from '../internal/buildQuery'\nexpect(buildQuery()).toBe('select 1')")
    })

    expect(result[0]).toEqual(expect.objectContaining({
      gate: 'indirect-test',
      passed: false,
      severity: 'blocker'
    }))
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
