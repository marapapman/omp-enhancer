import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { executeBrowserCheck } from '../../../src/tools/browserCheck.js'
import type { ExtensionToolContext } from '../../../src/ompApi.js'

function context(cwd: string): ExtensionToolContext {
  return { cwd, ui: { notify: () => undefined }, hasUI: false }
}

describe('executeBrowserCheck', () => {
  it('clicks visible UI through role locators or returns setup skip evidence', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-browser-'))
    const htmlPath = join(cwd, 'index.html')
    await writeFile(htmlPath, [
      '<!doctype html>',
      '<button>Save</button>',
      '<p id="result"></p>',
      '<script>',
      "document.querySelector('button').addEventListener('click', () => { document.querySelector('#result').textContent = 'Saved' })",
      '</script>'
    ].join('\n'))

    const evidence = await executeBrowserCheck({
      baseUrl: pathToFileURL(htmlPath).toString(),
      scenarios: [{
        name: 'save flow',
        steps: [
          { action: 'click', locator: { kind: 'role', role: 'button', name: 'Save' }, description: 'Click save.' },
          { action: 'assertVisible', locator: { kind: 'text', value: 'Saved', exact: true }, description: 'Saved result is visible.' }
        ]
      }]
    }, context(cwd))

    if (evidence.status === 'skipped') {
      expect(evidence.findings).toEqual([expect.objectContaining({ severity: 'warning', category: 'setup' })])
      return
    }

    expect(evidence.status).toBe('passed')
    expect(evidence.findings.filter(finding => !finding.passed && finding.severity === 'blocker')).toEqual([])
  })
})
