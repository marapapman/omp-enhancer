import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { findPublicEntryHints, findRelatedTests, readRepoFiles } from '../../../src/repo/repoScanner.js'

async function tempRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-repo-'))
  await mkdir(join(cwd, 'src', 'user'), { recursive: true })
  await mkdir(join(cwd, 'tests', 'src', 'user'), { recursive: true })
  await writeFile(join(cwd, 'src', 'user', 'UserService.ts'), 'export class UserService {}')
  await writeFile(join(cwd, 'src', 'user', 'UserService.test.ts'), 'import { UserService } from ./UserService')
  await writeFile(join(cwd, 'src', 'user', 'index.ts'), 'export { UserService } from ./UserService')
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ exports: { '.': './src/index.ts' } }))
  return cwd
}

describe('repoScanner', () => {
  it('finds related tests and public entry hints', async () => {
    const cwd = await tempRepo()

    expect(await findRelatedTests(cwd, 'src/user/UserService.ts')).toEqual([
      'src/user/UserService.test.ts'
    ])
    expect(await findPublicEntryHints(cwd, 'src/user/UserService.ts', 'UserService')).toEqual([
      'src/user/index.ts#UserService',
      'package.json#exports'
    ])
  })

  it('finds browser and route related frontend tests', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, 'src', 'app', 'settings'), { recursive: true })
    await mkdir(join(cwd, 'tests', 'e2e', 'src', 'app', 'settings'), { recursive: true })
    await mkdir(join(cwd, 'playwright', 'src', 'app', 'settings'), { recursive: true })
    await writeFile(join(cwd, 'src', 'app', 'settings', 'page.tsx'), 'export default function Page() { return null }')
    await writeFile(join(cwd, 'src', 'app', 'settings', 'SettingsPanel.tsx'), 'export function SettingsPanel() { return null }')
    await writeFile(join(cwd, 'tests', 'e2e', 'src', 'app', 'settings', 'settings.e2e.spec.ts'), 'test()')
    await writeFile(join(cwd, 'playwright', 'src', 'app', 'settings', 'SettingsPanel.browser.spec.tsx'), 'test()')

    expect(await findRelatedTests(cwd, 'src/app/settings/SettingsPanel.tsx')).toEqual([
      'playwright/src/app/settings/SettingsPanel.browser.spec.tsx'
    ])
    expect(await findRelatedTests(cwd, 'src/app/settings/page.tsx')).toEqual([
      'tests/e2e/src/app/settings/settings.e2e.spec.ts'
    ])
    expect(await findPublicEntryHints(cwd, 'src/app/settings/page.tsx', 'page')).toContain('src/app/settings/page.tsx')
  })

  it('finds api contract and mock hints for api targets', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, 'src', 'routes'), { recursive: true })
    await mkdir(join(cwd, 'src', 'mocks'), { recursive: true })
    await mkdir(join(cwd, 'tests', 'contracts'), { recursive: true })
    await mkdir(join(cwd, 'pact'), { recursive: true })
    await writeFile(join(cwd, 'src', 'routes', 'orders.ts'), 'export function createOrder() {}')
    await writeFile(join(cwd, 'openapi.yaml'), 'paths: {}')
    await writeFile(join(cwd, 'src', 'mocks', 'handlers.ts'), 'export const handlers = []')
    await writeFile(join(cwd, 'tests', 'contracts', 'orders.pact.ts'), 'test()')
    await writeFile(join(cwd, 'pact', 'orders.json'), '{}')

    expect(await findPublicEntryHints(cwd, 'src/routes/orders.ts', 'createOrder')).toEqual(expect.arrayContaining([
      'openapi.yaml#contract',
      'src/mocks/handlers.ts#msw',
      'tests/contracts/orders.pact.ts#contract',
      'pact/orders.json#contract'
    ]))
  })

  it('skips unsafe paths', async () => {
    const cwd = await tempRepo()

    expect(await readRepoFiles(cwd, ['src/user/UserService.ts', '../outside.ts', '/tmp/outside.ts'])).toEqual([
      { path: 'src/user/UserService.ts', content: 'export class UserService {}' }
    ])
  })

  it('does not follow repository symlinks that escape the workspace', async () => {
    const cwd = await tempRepo()
    const outside = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-repo-outside-'))
    await mkdir(join(cwd, 'links'), { recursive: true })
    await writeFile(join(outside, 'secret.ts'), 'export const secret = true')
    await symlink(join(outside, 'secret.ts'), join(cwd, 'links', 'secret.ts'))
    await symlink(join(cwd, 'src', 'user', 'UserService.ts'), join(cwd, 'links', 'UserService.ts'))

    expect(await readRepoFiles(cwd, ['links/secret.ts', 'links/UserService.ts'])).toEqual([
      { path: 'links/UserService.ts', content: 'export class UserService {}' }
    ])
  })
})
