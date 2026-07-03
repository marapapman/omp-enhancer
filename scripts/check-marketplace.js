import { readFile } from 'node:fs/promises'
import path from 'node:path'

const catalogPath = path.join(process.cwd(), '.omp-plugin', 'marketplace.json')
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))

const expected = [
  ['omp-config', './omp-config'],
  ['writing-helper', './writing-helper'],
  ['omp-testing-enhancer', './omp-test-enhancer'],
  ['omp-enhancer-core', './omp-enhancer-core']
]

if (catalog.name !== 'omp-enhancer') {
  throw new Error(`Expected marketplace name omp-enhancer, got ${catalog.name}`)
}

if (catalog.metadata?.pluginRoot !== 'plugins') {
  throw new Error('Expected metadata.pluginRoot to equal plugins')
}

for (const [name, source] of expected) {
  const plugin = catalog.plugins.find(entry => entry.name === name)
  if (!plugin) throw new Error(`Missing plugin entry ${name}`)
  if (plugin.source !== source) {
    throw new Error(`Plugin ${name} source mismatch: expected ${source}, got ${plugin.source}`)
  }
}

console.log('marketplace catalog ok')
