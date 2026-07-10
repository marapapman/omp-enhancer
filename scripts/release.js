#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { writeSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const pluginDirectoryByName = new Map([
  ['omp-config', 'omp-config'],
  ['writing-helper', 'writing-helper'],
  ['omp-testing-enhancer', 'omp-test-enhancer'],
  ['omp-fact-checker', 'omp-fact-checker'],
  ['omp-enhancer-core', 'omp-enhancer-core']
])

const pluginNames = [...pluginDirectoryByName.keys()]

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = await planRelease(process.cwd(), options)

    printPlan(result)

    if (options.apply) {
      await applyRelease(result)
      writeLine(process.stdout, 'release files updated')
    } else {
      writeLine(process.stdout, 'dry-run: no files were changed')
    }
  } catch (error) {
    writeLine(process.stderr, error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export function parseArgs(args) {
  const options = {
    plugin: null,
    version: null,
    bump: null,
    apply: false,
    pinRef: false,
    allowDowngrade: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--plugin') options.plugin = readValue(args, ++index, '--plugin')
    else if (arg === '--version') options.version = readValue(args, ++index, '--version')
    else if (arg === '--bump') options.bump = readValue(args, ++index, '--bump')
    else if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.apply = false
    else if (arg === '--pin-ref') options.pinRef = true
    else if (arg === '--allow-downgrade') options.allowDowngrade = true
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`unknown argument ${arg}`)
    }
  }

  if (!options.plugin) throw new Error('missing --plugin')
  if (!options.version && !options.bump) throw new Error('missing --version or --bump')
  if (options.version && options.bump) throw new Error('use either --version or --bump, not both')
  if (options.bump && !['major', 'minor', 'patch'].includes(options.bump)) {
    throw new Error(`invalid --bump ${options.bump}`)
  }

  return options
}

function readValue(args, index, flag) {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

export async function planRelease(rootDir, options) {
  const rootPackagePath = path.join(rootDir, 'package.json')
  const catalogPath = path.join(rootDir, '.omp-plugin', 'marketplace.json')
  const rootPackage = await readJson(rootPackagePath)
  const catalog = await readJson(catalogPath)
  const selectedNames = resolveSelectedPlugins(options.plugin)
  const changes = []

  const plannedRootPackage = structuredClone(rootPackage)
  const plannedCatalog = structuredClone(catalog)

  if (options.plugin === 'all' && options.bump) {
    plannedCatalog.metadata = plannedCatalog.metadata ?? {}
    const currentMetadataVersion = String(plannedCatalog.metadata.version ?? '0.0.0')
    plannedCatalog.metadata.version = bumpVersion(currentMetadataVersion, options.bump)
    changes.push({ file: '.omp-plugin/marketplace.json', field: 'metadata.version', from: currentMetadataVersion, to: plannedCatalog.metadata.version })
  }

  for (const name of selectedNames) {
    const directory = pluginDirectoryByName.get(name)
    const packagePath = path.join(rootDir, 'plugins', directory, 'package.json')
    const packageJson = await readJson(packagePath)
    const catalogPlugin = plannedCatalog.plugins?.find((plugin) => plugin.name === name)
    if (!catalogPlugin) throw new Error(`marketplace entry for ${name} was not found`)

    const currentVersion = String(packageJson.version)
    const nextVersion = options.version ?? bumpVersion(currentVersion, options.bump)
    assertValidVersion(nextVersion)

    if (!options.allowDowngrade && compareVersions(nextVersion, currentVersion) < 0) {
      throw new Error(`version downgrade for ${name} is not allowed: ${currentVersion} -> ${nextVersion}`)
    }

    const plannedPackage = structuredClone(packageJson)
    plannedPackage.version = nextVersion
    catalogPlugin.version = nextVersion

    if (options.pinRef) catalogPlugin.ref = releaseTagForVersion(nextVersion)
    else delete catalogPlugin.ref

    changes.push({ file: `plugins/${directory}/package.json`, field: 'version', from: currentVersion, to: nextVersion, content: plannedPackage, path: packagePath })
    changes.push({ file: '.omp-plugin/marketplace.json', field: `${name}.version`, from: currentVersion, to: nextVersion })
    changes.push({ file: '.omp-plugin/marketplace.json', field: `${name}.ref`, from: catalogPlugin.ref ?? 'track-main', to: options.pinRef ? releaseTagForVersion(nextVersion) : 'track-main' })
  }

  return {
    rootDir,
    options,
    rootPackagePath,
    catalogPath,
    rootPackage: plannedRootPackage,
    catalog: plannedCatalog,
    changes
  }
}

export async function applyRelease(result) {
  const packageChanges = result.changes.filter((change) => change.path && change.content)
  for (const change of packageChanges) {
    await writeJson(change.path, change.content)
  }
  await writeJson(result.catalogPath, result.catalog)
}

function resolveSelectedPlugins(plugin) {
  if (plugin === 'all') return pluginNames
  if (!pluginDirectoryByName.has(plugin)) throw new Error(`unknown plugin ${plugin}`)
  return [plugin]
}

function bumpVersion(version, bump) {
  const parts = parseVersion(version)
  if (bump === 'major') return `${parts.major + 1}.0.0`
  if (bump === 'minor') return `${parts.major}.${parts.minor + 1}.0`
  return `${parts.major}.${parts.minor}.${parts.patch + 1}`
}

function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  return 0
}

function assertValidVersion(version) {
  parseVersion(version)
}

function parseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`invalid semver version ${version}`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function releaseTagForVersion(version) {
  return String(version).startsWith('v') ? String(version) : `v${version}`
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function printPlan(result) {
  writeLine(process.stdout, result.options.apply ? 'release plan:' : 'dry-run release plan:')
  for (const change of result.changes) {
    writeLine(process.stdout, `- ${change.file} ${change.field}: ${change.from} -> ${change.to}`)
  }
}

function printHelp() {
  writeLine(process.stdout, `Usage: node scripts/release.js --plugin <name|all> (--version <x.y.z>|--bump patch|minor|major) [--apply] [--pin-ref] [--allow-downgrade]\n\nDefault mode is track-main: catalog refs are removed so marketplace upgrade tracks the latest GitHub marketplace catalog.`)
}

function writeLine(stream, value) {
  writeSync(stream.fd, `${value}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
