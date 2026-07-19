import { readdir } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('testing Agent surface', () => {
  it('does not package phase-specific testing Agents', async () => {
    const entries = await readdir(new URL('../../agents/', import.meta.url)).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    })

    expect(entries.filter(entry => entry.endsWith('.md'))).toEqual([])
  })
})
