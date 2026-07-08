import { describe, expect, it } from 'vitest'
import { isRecord } from '../../src/utils.js'

describe('isRecord', () => {
  it('accepts non-null, non-array objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ name: 'target', enabled: true })).toBe(true)
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'value'],
    ['number', 42],
    ['boolean', false],
    ['undefined', undefined]
  ])('rejects %s', (_name, value) => {
    expect(isRecord(value)).toBe(false)
  })
})
