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

const expectedSkillsByPlugin = new Map([
  ['omp-config', [
    './skills/caveman',
    './skills/conventional-commits',
    './skills/deepseek-tool-calling',
    './skills/diagnose',
    './skills/docker-compose',
    './skills/go-testing',
    './skills/grill-with-docs',
    './skills/handoff',
    './skills/improve-codebase-architecture',
    './skills/prototype',
    './skills/tdd',
    './skills/zoom-out'
  ]]
])

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
  if (Object.hasOwn(plugin, 'ref')) {
    throw new Error(`Plugin ${name} is pinned to ${plugin.ref}; remove ref so marketplace upgrade tracks main`)
  }

  const expectedSkills = expectedSkillsByPlugin.get(name)
  if (expectedSkills) {
    const actualSkills = plugin.skills ?? []
    if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) {
      throw new Error(`Plugin ${name} skills mismatch: expected ${expectedSkills.join(', ')}, got ${actualSkills.join(', ')}`)
    }
  }
}

console.log('marketplace catalog ok')
