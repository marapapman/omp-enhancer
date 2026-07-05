import { access, readdir, readFile } from 'node:fs/promises'
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
  if (Object.hasOwn(plugin, 'ref')) {
    throw new Error(`Plugin ${name} is pinned to ${plugin.ref}; remove ref so marketplace upgrade tracks main`)
  }

  const expectedSkills = await expectedSkillPathsForPlugin(source)
  const actualSkills = plugin.skills ?? []
  if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) {
    throw new Error(`Plugin ${name} skills mismatch: expected ${expectedSkills.join(', ')}, got ${actualSkills.join(', ')}`)
  }
}

console.log('marketplace catalog ok')

async function expectedSkillPathsForPlugin(source) {
  const pluginRoot = path.join(process.cwd(), 'plugins', source.replace(/^\.\//, ''))
  const packageJson = JSON.parse(await readFile(path.join(pluginRoot, 'package.json'), 'utf8'))
  const skillRoots = packageJson.pi?.skills ?? []
  if (!skillRoots.length) return []

  const skillDirs = []
  for (const skillRoot of skillRoots) {
    const rootDir = path.join(pluginRoot, skillRoot)
    for (const skillDir of await findSkillDirs(rootDir)) {
      const relative = path.relative(pluginRoot, skillDir).split(path.sep).join('/')
      skillDirs.push(`./${relative}`)
    }
  }

  return skillDirs
    .sort()
}

async function findSkillDirs(rootDir) {
  const result = []
  await walk(rootDir)
  return result

  async function walk(dir) {
    if (await hasSkillDoc(dir)) result.push(dir)

    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      await walk(path.join(dir, entry.name))
    }
  }
}

async function hasSkillDoc(dir) {
  try {
    await access(path.join(dir, 'SKILL.md'))
    return true
  } catch {
    return false
  }
}
