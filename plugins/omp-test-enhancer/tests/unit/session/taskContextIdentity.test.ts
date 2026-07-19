import { describe, expect, it } from 'vitest'
import {
  CORE_STATE_ENTRY,
  readCoreTaskContextIdentityFromEntries
} from '../../../src/session/taskContextIdentity.js'

describe('taskContextIdentity', () => {
  it('derives the latest identity from the stable advisory Core task shape', () => {
    expect(readCoreTaskContextIdentityFromEntries([
      coreState(101),
      coreState(202)
    ])).toBe('task:202')
  })

  it('accepts schema evolution and skips malformed or legacy route-shaped snapshots', () => {
    expect(readCoreTaskContextIdentityFromEntries([
      coreState(303, 6)
    ])).toBe('task:303')

    expect(readCoreTaskContextIdentityFromEntries([
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { schemaVersion: 2, taskStartedAt: 0, lastTaskContext: { intent: 'agent-selected' } } },
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { schemaVersion: 2, taskStartedAt: 300, lastTaskContext: null } },
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { schemaVersion: 2, taskStartedAt: 400, lastTaskContext: { intent: 'diagnostic-probe' } } },
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { schemaVersion: 2, routeStartedAt: 500, lastRoute: { intent: 'code.dev' } } }
    ])).toBeUndefined()
  })

  it('uses task start time as the stable scope across task-context updates', () => {
    expect(readCoreTaskContextIdentityFromEntries([
      coreState(404),
      coreState(404)
    ])).toBe('task:404')
  })
})

function coreState(taskStartedAt: number, schemaVersion = 6) {
  return {
    type: 'custom',
    customType: CORE_STATE_ENTRY,
    data: {
      schemaVersion,
      taskStartedAt,
      lastTaskContext: { intent: 'agent-selected' }
    }
  }
}
