import { access, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { assertPluginWorkspaceInventory, pluginWorkspaces } from './plugin-workspaces.js'

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--write')) throw new Error(`Unknown argument: ${args.join(' ')}`)
const write = args.includes('--write')
const catalogPath = path.join(process.cwd(), '.omp-plugin', 'marketplace.json')
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const rootPackage = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8'))
const packageLock = JSON.parse(await readFile(path.join(process.cwd(), 'package-lock.json'), 'utf8'))
const packageManifests = new Map(await Promise.all(pluginWorkspaces.map(async ({ workspace }) => [
  workspace,
  JSON.parse(await readFile(path.join(process.cwd(), workspace, 'package.json'), 'utf8')),
])))

assertPluginWorkspaceInventory({ rootPackage, packageLock, catalog, packageManifests })

for (let index = 0; index < pluginWorkspaces.length; index += 1) {
  const { name, workspace } = pluginWorkspaces[index]
  const plugin = catalog.plugins[index]
  const pluginRoot = path.join(process.cwd(), workspace)
  const packageJson = packageManifests.get(workspace)

  const expectedSkills = await expectedSkillPathsForPlugin(pluginRoot, packageJson)
  const actualSkills = plugin.skills ?? []
  if (write) {
    if (expectedSkills.length > 0) plugin.skills = expectedSkills
    else delete plugin.skills
  } else if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) {
    throw new Error(`Plugin ${name} skills mismatch: expected ${expectedSkills.join(', ')}, got ${actualSkills.join(', ')}`)
  }
}

if (write) {
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
  console.log('marketplace Skill paths updated')
} else {
  console.log('marketplace catalog ok')
}

async function expectedSkillPathsForPlugin(pluginRoot, packageJson) {
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
