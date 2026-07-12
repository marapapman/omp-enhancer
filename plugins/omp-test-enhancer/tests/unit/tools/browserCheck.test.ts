import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { executeBrowserCheck, isAllowedBrowserServerCommand, normalizeBrowserFindings, resolveSafeBrowserArtifactDir, splitCommandLine } from '../../../src/tools/browserCheck.js'
import type { ExtensionToolContext } from '../../../src/ompApi.js'

describe('browserCheck helpers', () => {
  it('splits command lines with quoted arguments', () => {
    expect(splitCommandLine('bun run dev --host "127.0.0.1"')).toEqual(['bun', 'run', 'dev', '--host', '127.0.0.1'])
  })

  it('allows only explicit package-manager dev-server commands', () => {
    for (const command of ['npm start', 'npm run dev -- --host 127.0.0.1', 'pnpm preview', 'yarn serve', 'bun run dev']) {
      expect(isAllowedBrowserServerCommand(command)).toBe(true)
    }
    for (const command of ['rm -rf cache', 'curl https://example.com', 'node server.js', 'npm run release', 'npm run dev && rm -rf cache']) {
      expect(isAllowedBrowserServerCommand(command)).toBe(false)
    }
  })

  it('contains browser artifacts under the trusted root and rejects traversal or symlinks', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-artifacts-'))
    const outside = await mkdtemp(join(tmpdir(), 'omp-testing-outside-'))
    try {
      const safe = await resolveSafeBrowserArtifactDir(cwd, '.omp/testing-enhancer-artifacts/custom', 'run')
      expect(safe).toBe(join(cwd, '.omp', 'testing-enhancer-artifacts', 'custom'))
      expect(await resolveSafeBrowserArtifactDir(cwd, '../escaped', 'run')).toBeNull()

      const root = join(cwd, '.omp', 'testing-enhancer-artifacts')
      await mkdir(root, { recursive: true })
      await symlink(outside, join(root, 'linked'))
      expect(await resolveSafeBrowserArtifactDir(cwd, '.omp/testing-enhancer-artifacts/linked/run', 'run')).toBeNull()
    } finally {
      await rm(cwd, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('normalizes console and network findings by severity', () => {
    const findings = normalizeBrowserFindings({
      consoleErrors: [{ message: 'boom' }],
      consoleWarnings: [{ message: 'careful' }],
      pageErrors: [{ message: 'page failed' }],
      failedRequests: [{ url: 'http://localhost/api', failure: 'ECONNRESET' }],
      badResponses: [{ url: 'http://localhost/missing', status: 404 }, { url: 'http://localhost/down', status: 500 }]
    })

    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'critical', category: 'console-error' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'warning', category: 'console-error' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'critical', category: 'page-error' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'critical', category: 'network-failure', summary: 'Browser request failed.' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'warning', category: 'network-failure', summary: 'Browser response returned HTTP 404.' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'critical', category: 'network-failure', summary: 'Browser response returned HTTP 500.' })
    ]))
  })

  it('returns structured evidence when serverCommand cannot start', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-server-'))
    const htmlPath = join(cwd, 'index.html')
    await writeFile(htmlPath, '<!doctype html><p>ready</p>')

    const evidence = await executeBrowserCheck({
      baseUrl: pathToFileURL(htmlPath).toString(),
      serverCommand: 'definitely-not-an-omp-test-command',
      scenarios: []
    }, { cwd, ui: { notify: () => undefined }, hasUI: false } satisfies ExtensionToolContext)

    expect(evidence).toMatchObject({
      framework: 'playwright',
      status: 'failed',
      findings: [expect.objectContaining({ gate: 'browser-interaction', severity: 'critical', category: 'setup' })]
    })
  })

  it('rejects a destructive serverCommand before spawning it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-dangerous-server-'))
    const marker = join(cwd, 'keep.txt')
    await writeFile(marker, 'keep')
    try {
      const evidence = await executeBrowserCheck({
        baseUrl: 'http://127.0.0.1:3000',
        serverCommand: 'rm -rf keep.txt',
        scenarios: []
      }, { cwd, ui: { notify: () => undefined }, hasUI: false } satisfies ExtensionToolContext)
      expect(evidence.status).toBe('failed')
      await expect(access(marker)).resolves.toBeUndefined()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
