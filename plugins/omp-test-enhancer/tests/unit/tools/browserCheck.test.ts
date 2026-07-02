import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { executeBrowserCheck, normalizeBrowserFindings, splitCommandLine } from '../../../src/tools/browserCheck.js'
import type { ExtensionToolContext } from '../../../src/ompApi.js'

describe('browserCheck helpers', () => {
  it('splits command lines with quoted arguments', () => {
    expect(splitCommandLine('bun run dev --host "127.0.0.1"')).toEqual(['bun', 'run', 'dev', '--host', '127.0.0.1'])
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
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'blocker', category: 'console-error' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'warning', category: 'console-error' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'blocker', category: 'page-error' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'blocker', category: 'network-failure', summary: 'Browser request failed.' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'warning', category: 'network-failure', summary: 'Browser response returned HTTP 404.' }),
      expect.objectContaining({ gate: 'browser-interaction', passed: false, severity: 'blocker', category: 'network-failure', summary: 'Browser response returned HTTP 500.' })
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
      findings: [expect.objectContaining({ gate: 'browser-interaction', severity: 'blocker', category: 'setup' })]
    })
  })
})
