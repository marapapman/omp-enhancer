import { describe, expect, it } from 'vitest'
import { evaluateTestFileScopeGate } from '../../../src/gates/testFileScopeGate.js'

describe('evaluateTestFileScopeGate', () => {
  it('reports an empty candidate as an advisory finding', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: []
      }
    })).toEqual([{
      gate: 'test-file-scope',
      passed: false,
      severity: 'critical',
      summary: 'Candidate includes no test files.',
      evidence: { candidateId: 'candidate' },
      repairHint: 'Report that no changed test files were observed; provide them only if another advisory review is useful.'
    }])
  })

  it('reports candidate changes outside test paths', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [{ path: 'src/user/UserService.ts', action: 'modify', content: 'export class UserService {}' }]
      }
    })).toEqual([{
      gate: 'test-file-scope',
      passed: false,
      severity: 'critical',
      summary: 'Candidate modifies non-test files.',
      evidence: { file: 'src/user/UserService.ts' },
      repairHint: 'Report the non-test file and suggest separating implementation changes from candidate test files.'
    }])
  })

  it('reports candidate test paths that were not written to the workspace', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [{ path: 'src/user/UserService.test.ts', action: 'modify', content: '', missingFromWorkspace: true }]
      }
    })).toEqual([{
      gate: 'test-file-scope',
      passed: false,
      severity: 'critical',
      summary: 'Candidate file is missing from the workspace.',
      evidence: { file: 'src/user/UserService.test.ts' },
      repairHint: 'Report the missing candidate file and create it only when that change is already in scope.'
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
      severity: 'critical',
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
