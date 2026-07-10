import { describe, expect, it } from 'vitest'
import {
  CORE_GATE_OWNER_ENTRY,
  CORE_GATE_OWNER_SYMBOL,
  CORE_STATE_ENTRY,
  hasCoreGateOwner,
  readCoreGateOwner,
  readCoreRouteIdFromEntries
} from '../../../src/session/gateOwnership.js'
import type { ExtensionAPI } from '../../../src/ompApi.js'

describe('gateOwnership', () => {
  it('prefers the shared symbol marker over a persisted branch marker', () => {
    const pi = fakePi()
    Object.defineProperty(pi, CORE_GATE_OWNER_SYMBOL, {
      value: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 3 }
    })

    expect(readCoreGateOwner(pi, [{
      type: 'custom',
      customType: CORE_GATE_OWNER_ENTRY,
      data: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 2 }
    }])).toEqual({
      schemaVersion: 1,
      owner: 'omp-enhancer-core',
      controllerSchemaVersion: 3
    })
  })

  it('rejects unversioned and pre-controller markers', () => {
    const pi = fakePi()
    expect(hasCoreGateOwner(pi, [
      { type: 'custom', customType: CORE_GATE_OWNER_ENTRY, data: { owner: 'omp-enhancer-core' } },
      { type: 'custom', customType: CORE_GATE_OWNER_ENTRY, data: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 1 } }
    ])).toBe(false)
  })

  it('does not treat a persisted historical marker as a live core owner', () => {
    const pi = fakePi()
    const entries = [{
      type: 'custom',
      customType: CORE_GATE_OWNER_ENTRY,
      data: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 2 }
    }]

    expect(readCoreGateOwner(pi, entries)).toEqual({
      schemaVersion: 1,
      owner: 'omp-enhancer-core',
      controllerSchemaVersion: 2
    })
    expect(hasCoreGateOwner(pi, entries)).toBe(false)
  })

  it('reads the latest route id from the versioned core controller state', () => {
    expect(readCoreRouteIdFromEntries([
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { gateController: { routeId: 'route:old:1' } } },
      { type: 'custom', customType: CORE_STATE_ENTRY, data: { gateController: { routeId: 'route:new:2' } } }
    ])).toBe('route:new:2')
  })
})

function fakePi(): ExtensionAPI {
  return {
    zod: { z: fakeZod() },
    setLabel: () => undefined,
    registerTool: () => undefined,
    registerCommand: () => undefined,
    on: () => undefined,
    sendUserMessage: () => undefined,
    appendEntry: () => undefined
  }
}

function fakeZod() {
  return {
    object: (shape: Record<string, unknown>) => ({ type: 'object', shape }),
    string: () => ({ type: 'string' }),
    boolean: () => ({ type: 'boolean' }),
    unknown: () => ({ type: 'unknown' }),
    array: (schema: unknown) => ({ type: 'array', schema }),
    enum: (values: readonly [string, ...string[]]) => ({ type: 'enum', values }),
    optional: (schema: unknown) => ({ type: 'optional', schema })
  }
}
