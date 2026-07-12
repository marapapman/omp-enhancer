import { describe, expect, it } from 'vitest'
import {
  CORE_STATE_ENTRY,
  readCoreRouteIdentityFromEntries
} from '../../../src/session/routeIdentity.js'

describe('routeIdentity', () => {
  it('derives the latest diagnostic identity from an advisory core v2 snapshot', () => {
    expect(readCoreRouteIdentityFromEntries([
      coreState(101, 'code.dev'),
      coreState(202, 'bug-audit')
    ])).toBe('route:202')
  })

  it('skips malformed and non-v2 snapshots', () => {
    expect(readCoreRouteIdentityFromEntries([
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { schemaVersion: 1, routeStartedAt: 100, lastRoute: { intent: 'code.dev' } } },
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { schemaVersion: 2, routeStartedAt: 0, lastRoute: { intent: 'code.dev' } } },
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { schemaVersion: 2, routeStartedAt: 300, lastRoute: null } }
    ])).toBeUndefined()
  })

  it('uses route start time as the stable user-turn scope across route refinements', () => {
    expect(readCoreRouteIdentityFromEntries([
      coreState(404, 'unknown'),
      coreState(404, 'code.dev')
    ])).toBe('route:404')
  })
})

function coreState(routeStartedAt: number, intent: string) {
  return {
    type: 'custom',
    customType: CORE_STATE_ENTRY,
    data: {
      schemaVersion: 2,
      routeStartedAt,
      lastRoute: { intent }
    }
  }
}
