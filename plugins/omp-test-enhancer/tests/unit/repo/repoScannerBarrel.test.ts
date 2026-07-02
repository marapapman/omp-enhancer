import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { findPublicEntryHints } from '../../../src/repo/repoScanner.js'

describe('findPublicEntryHints root barrels', () => {
  it('detects extensionless root barrel exports for source files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-barrel-'))
    await mkdir(join(cwd, 'src', 'user'), { recursive: true })
    await writeFile(join(cwd, 'src', 'user', 'UserService.ts'), 'export class UserService {}')
    await writeFile(join(cwd, 'src', 'index.ts'), "export * from './user/UserService'\n")

    expect(await findPublicEntryHints(cwd, 'src/user/UserService.ts', 'UserService')).toEqual(['src/index.ts'])
  })
})
