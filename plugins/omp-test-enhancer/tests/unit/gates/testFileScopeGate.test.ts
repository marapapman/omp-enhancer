import { describe, expect, it } from 'vitest'
import { evaluateTestFileScopeGate } from '../../../src/gates/testFileScopeGate.js'

describe('evaluateTestFileScopeGate', () => {
  it('blocks an empty candidate instead of passing a no-op gate', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: []
      }
    })).toEqual([{
      gate: 'test-file-scope',
      passed: false,
      severity: 'blocker',
      summary: 'Candidate includes no test files.',
      evidence: { candidateId: 'candidate' },
      repairHint: 'Provide the test files changed by this workflow before running the gate.'
    }])
  })

  it('blocks candidate changes outside test paths', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [{ path: 'src/user/UserService.ts', action: 'modify', content: 'export class UserService {}' }]
      }
    })).toEqual([{
      gate: 'test-file-scope',
      passed: false,
      severity: 'blocker',
      summary: 'Candidate modifies non-test files.',
      evidence: { file: 'src/user/UserService.ts' },
      repairHint: 'Only change test files in this workflow. If production code must change, stop and ask for a separate implementation task.'
    }])
  })

  it('blocks candidate test paths that were not written to the workspace', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [{ path: 'src/user/UserService.test.ts', action: 'modify', content: '', missingFromWorkspace: true }]
      }
    })).toEqual([{
      gate: 'test-file-scope',
      passed: false,
      severity: 'blocker',
      summary: 'Candidate file is missing from the workspace.',
      evidence: { file: 'src/user/UserService.test.ts' },
      repairHint: 'Write the candidate test file to disk before running the gate.'
    }])
  })

  it('passes test files and tests directories', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [
          { path: 'src/user/UserService.test.ts', action: 'create', content: '' },
          { path: 'src/user/UserService.spec.mts', action: 'create', content: '' },
          { path: 'src/user/__tests__/UserService.spec.ts', action: 'create', content: '' },
          { path: 'tests/src/user/UserService.ts', action: 'create', content: '' },
          { path: 'tests/e2e/account.spec.ts', action: 'create', content: '' },
          { path: 'cypress/e2e/account.cy.ts', action: 'create', content: '' },
          { path: 'playwright/account.browser.spec.tsx', action: 'create', content: '' }
        ]
      }
    })).toEqual([{
      gate: 'test-file-scope',
      passed: true,
      severity: 'blocker',
      summary: 'Candidate changes are limited to test files.',
      evidence: {}
    }])
  })

  it('does not treat helper names that merely contain tests as test directories', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [{ path: 'src/testsHelper.ts', action: 'create', content: '' }]
      }
    })).toEqual([expect.objectContaining({ gate: 'test-file-scope', passed: false })])
  })
})
