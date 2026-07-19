import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { executeBrowserCheck, executeBrowserScenarios, isAllowedBrowserServerCommand, normalizeBrowserFindings, resolveSafeBrowserArtifactDir, splitCommandLine } from '../../../src/tools/browserCheck.js'
import type { ExtensionToolContext } from '../../../src/ompApi.js'

async function writeSolidPng(path: string): Promise<void> {
  const image = new PNG({ width: 2, height: 2 })
  image.data.fill(255)
  await writeFile(path, PNG.sync.write(image))
}

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
      targetIds: [],
      scenarioCount: 0,
      stepCount: 0,
      captureCount: 0,
      visualAssertionCount: 0,
      findings: [expect.objectContaining({ gate: 'browser-interaction', severity: 'critical', category: 'setup' })]
    })
  })

  it('returns a structured failure for an unknown action before browser launch', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-invalid-action-'))
    const evidence = await executeBrowserCheck({
      baseUrl: 'http://127.0.0.1:3000',
      targetIds: ['src/ui/App.tsx#App'],
      scenarios: [{ name: 'invalid', steps: [{ action: 'teleport', description: 'Unknown action' }] }]
    }, { cwd, ui: { notify: () => undefined }, hasUI: false } satisfies ExtensionToolContext)

    expect(evidence).toMatchObject({
      status: 'failed',
      targetIds: ['src/ui/App.tsx#App'],
      scenarioCount: 0,
      stepCount: 0,
      captureCount: 0,
      visualAssertionCount: 0,
      findings: [expect.objectContaining({
        summary: 'Invalid browser check parameters.',
        evidence: { path: '$.scenarios[0].steps[0].action', message: 'Unsupported browser action.' }
      })]
    })
  })

  it('counts only browser steps and scenarios that complete successfully', async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-counts-'))
    const locator = (value: string) => ({
      click: async () => {
        if (value === 'broken') throw new Error('element is not actionable')
      }
    })
    const page = {
      goto: async () => undefined,
      getByText: (value: string) => locator(value),
      screenshot: async () => undefined
    }

    try {
      const result = await executeBrowserScenarios(page as never, {
        baseUrl: 'http://127.0.0.1:3000',
        scenarios: [
          {
            name: 'completed',
            steps: [
              { action: 'goto', url: '/', description: 'Open page' },
              { action: 'click', locator: { kind: 'text', value: 'ready' }, description: 'Click ready' }
            ]
          },
          {
            name: 'partially completed',
            steps: [
              { action: 'goto', url: '/other', description: 'Open other page' },
              { action: 'click', locator: { kind: 'text', value: 'broken' }, description: 'Click broken' }
            ]
          }
        ]
      }, artifactDir)

      expect(result.executionCounts).toEqual({
        scenarioCount: 1,
        stepCount: 3,
        captureCount: 0,
        visualAssertionCount: 0
      })
      expect(result.findings).toEqual([
        expect.objectContaining({ passed: false, category: 'actionability', summary: 'Browser step failed: Click broken' })
      ])
    } finally {
      await rm(artifactDir, { recursive: true, force: true })
    }
  })

  it('keeps capture-only evidence separate from completed visual assertions', async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-captures-'))
    const page = {
      goto: async () => undefined,
      screenshot: async ({ path }: { path: string }) => writeSolidPng(path)
    }

    try {
      const captureOnly = await executeBrowserScenarios(page as never, {
        baseUrl: 'http://127.0.0.1:3000',
        scenarios: [{
          name: 'capture only',
          steps: [{ action: 'goto', url: '/', description: 'Open page' }],
          visualChecks: [{ kind: 'page', name: 'current page' }]
        }]
      }, artifactDir)
      expect(captureOnly.executionCounts).toEqual({
        scenarioCount: 1,
        stepCount: 1,
        captureCount: 1,
        visualAssertionCount: 0
      })

      const expectedPath = join(artifactDir, 'expected.png')
      await writeSolidPng(expectedPath)
      const compared = await executeBrowserScenarios(page as never, {
        baseUrl: 'http://127.0.0.1:3000',
        scenarios: [{
          name: 'baseline comparison',
          steps: [{ action: 'goto', url: '/', description: 'Open page' }],
          visualChecks: [{ kind: 'page', name: 'matches baseline', expectedPath }]
        }]
      }, artifactDir)
      expect(compared.executionCounts).toEqual({
        scenarioCount: 1,
        stepCount: 1,
        captureCount: 1,
        visualAssertionCount: 1
      })
      expect(compared.findings).toEqual([])
    } finally {
      await rm(artifactDir, { recursive: true, force: true })
    }
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
