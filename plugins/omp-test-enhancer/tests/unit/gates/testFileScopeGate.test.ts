import { describe, expect, it } from 'vitest'
import { evaluateTestFileScopeGate } from '../../../src/gates/testFileScopeGate.js'

describe('evaluateTestFileScopeGate', () => {
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

  it('passes test files and tests directories', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [
          { path: 'src/user/UserService.test.ts', action: 'create', content: '' },
          { path: 'src/user/__tests__/UserService.spec.ts', action: 'create', content: '' },
          { path: 'tests/src/user/UserService.ts', action: 'create', content: '' },
          { path: 'tests/e2e/account.spec.ts', action: 'create', content: '' },
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

  it('blocks Cypress-style files outside tests directories', () => {
    expect(evaluateTestFileScopeGate({
      candidate: {
        id: 'candidate',
        targetId: 'target',
        files: [{ path: 'cypress/e2e/account.cy.ts', action: 'create', content: '' }]
      }
    })).toEqual([expect.objectContaining({ gate: 'test-file-scope', passed: false })])
  })
})
