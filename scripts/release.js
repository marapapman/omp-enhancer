#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { constants, writeSync } from 'node:fs'
import { copyFile, lstat, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { assertPluginWorkspaceInventory, pluginWorkspaces } from './plugin-workspaces.js'

const pluginDirectoryByName = new Map(pluginWorkspaces.map(({ name, directory }) => [name, directory]))
const pluginNames = pluginWorkspaces.map(({ name }) => name)

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
    catalogBump: null,
    apply: false,
    allowDowngrade: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--plugin') options.plugin = readValue(args, ++index, '--plugin')
    else if (arg === '--version') options.version = readValue(args, ++index, '--version')
    else if (arg === '--bump') options.bump = readValue(args, ++index, '--bump')
    else if (arg === '--catalog-bump') options.catalogBump = readValue(args, ++index, '--catalog-bump')
    else if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.apply = false
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
  if (options.catalogBump && !['major', 'minor', 'patch'].includes(options.catalogBump)) {
    throw new Error(`invalid --catalog-bump ${options.catalogBump}`)
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
  const packageLockPath = path.join(rootDir, 'package-lock.json')
  const catalogPath = path.join(rootDir, '.omp-plugin', 'marketplace.json')
  const [rootPackage, packageLock, catalog, packageManifests] = await Promise.all([
    readJson(rootPackagePath),
    readJson(packageLockPath),
    readJson(catalogPath),
    readPluginPackageManifests(rootDir),
  ])
  assertPluginWorkspaceInventory({
    rootPackage,
    packageLock,
    catalog,
    packageManifests,
    checkVersions: false,
    requireTrackMain: false,
  })

  const selectedNames = resolveSelectedPlugins(options.plugin)
  const changes = []

  const plannedPackageLock = structuredClone(packageLock)
  const plannedCatalog = structuredClone(catalog)
  const plannedPackageManifests = new Map(packageManifests)

  const catalogBump = options.catalogBump ?? (options.plugin === 'all' ? options.bump : null)
  if (catalogBump) {
    plannedCatalog.metadata = plannedCatalog.metadata ?? {}
    const currentMetadataVersion = String(plannedCatalog.metadata.version ?? '0.0.0')
    plannedCatalog.metadata.version = bumpVersion(currentMetadataVersion, catalogBump)
    changes.push({ file: '.omp-plugin/marketplace.json', field: 'metadata.version', from: currentMetadataVersion, to: plannedCatalog.metadata.version })
  }

  for (const name of selectedNames) {
    const directory = pluginDirectoryByName.get(name)
    const workspaceKey = `plugins/${directory}`
    const packagePath = path.join(rootDir, workspaceKey, 'package.json')
    const packageJson = packageManifests.get(workspaceKey)
    const catalogPlugin = plannedCatalog.plugins?.find((plugin) => plugin.name === name)
    const lockWorkspace = plannedPackageLock.packages?.[workspaceKey]

    const currentVersion = String(packageJson.version)
    const currentCatalogVersion = String(catalogPlugin.version ?? '')
    const currentLockVersion = String(lockWorkspace.version ?? '')
    const nextVersion = options.version ?? bumpVersion(currentVersion, options.bump)
    const currentVersions = [currentVersion, currentCatalogVersion, currentLockVersion]
    for (const version of [...currentVersions, nextVersion]) assertValidVersion(version)
    const highestCurrentVersion = currentVersions.reduce((highest, version) => (
      compareVersions(version, highest) > 0 ? version : highest
    ))

    if (!options.allowDowngrade && compareVersions(nextVersion, highestCurrentVersion) < 0) {
      throw new Error(
        `version downgrade for ${name} is not allowed: highest current version ${highestCurrentVersion} `
        + `(package ${currentVersion}, catalog ${currentCatalogVersion}, lock ${currentLockVersion}) -> ${nextVersion}`,
      )
    }

    const plannedPackage = structuredClone(packageJson)
    plannedPackage.version = nextVersion
    plannedPackageManifests.set(workspaceKey, plannedPackage)
    const currentRef = Object.hasOwn(catalogPlugin, 'ref') ? String(catalogPlugin.ref) : null
    catalogPlugin.version = nextVersion
    lockWorkspace.version = nextVersion

    delete catalogPlugin.ref

    changes.push({ file: `plugins/${directory}/package.json`, field: 'version', from: currentVersion, to: nextVersion, content: plannedPackage, path: packagePath })
    changes.push({ file: 'package-lock.json', field: `packages.${workspaceKey}.version`, from: currentLockVersion, to: nextVersion })
    changes.push({ file: '.omp-plugin/marketplace.json', field: `${name}.version`, from: currentCatalogVersion, to: nextVersion })
    if (currentRef !== null) {
      changes.push({ file: '.omp-plugin/marketplace.json', field: `${name}.ref`, from: currentRef, to: 'track-main' })
    }
  }

  assertPluginWorkspaceInventory({
    rootPackage,
    packageLock: plannedPackageLock,
    catalog: plannedCatalog,
    packageManifests: plannedPackageManifests,
  })

  return {
    options,
    packageLockPath,
    catalogPath,
    packageLock: plannedPackageLock,
    catalog: plannedCatalog,
    changes
  }
}

export async function applyRelease(result, transactionOptions) {
  const packageChanges = result.changes.filter((change) => change.path && change.content)
  await writeJsonFilesTransaction([
    ...packageChanges.map(({ path: filePath, content }) => ({ path: filePath, value: content })),
    { path: result.packageLockPath, value: result.packageLock },
    { path: result.catalogPath, value: result.catalog },
  ], transactionOptions)
}

export async function writeJsonFilesTransaction(files, { onStep } = {}) {
  if (!Array.isArray(files) || files.length === 0) return
  if (onStep !== undefined && typeof onStep !== 'function') {
    throw new Error('release transaction onStep must be a function')
  }

  const targetPaths = files.map(({ path: filePath }) => path.resolve(filePath))
  if (new Set(targetPaths).size !== targetPaths.length) {
    throw new Error('release transaction targets must be unique')
  }

  const transactionId = `${process.pid}-${randomUUID()}`
  const entries = []

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const targetPath = targetPaths[index]
      const directory = path.dirname(targetPath)
      const artifactPrefix = `.${path.basename(targetPath)}.release-${transactionId}-${index}`
      const fileStat = await lstat(targetPath)
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
        throw new Error(`release transaction target must be a regular file: ${targetPath}`)
      }
      const entry = {
        index,
        targetPath,
        directory,
        tempPath: path.join(directory, `${artifactPrefix}.tmp`),
        backupPath: path.join(directory, `${artifactPrefix}.bak`),
        restorePath: path.join(directory, `${artifactPrefix}.restore`),
        originalContent: null,
        mode: fileStat.mode & 0o777,
        tempReady: false,
        backupReady: false,
        restoreReady: false,
        committed: false,
      }
      entries.push(entry)

      await writeSyncedFile(entry.tempPath, `${JSON.stringify(file.value, null, 2)}\n`, entry.mode)
      entry.tempReady = true
      await copyFile(entry.targetPath, entry.backupPath, constants.COPYFILE_EXCL)
      entry.backupReady = true
      await syncFile(entry.backupPath)
      entry.originalContent = await readFile(entry.backupPath)
      await onStep?.({ phase: 'backed-up', index, path: targetPath })
      await onStep?.({ phase: 'prepared', index, path: targetPath })
    }

    await syncReleaseDirectories(entries)

    for (const entry of entries) {
      await onStep?.({ phase: 'before-commit', index: entry.index, path: entry.targetPath })
      await rename(entry.tempPath, entry.targetPath)
      entry.tempReady = false
      entry.committed = true
      await syncDirectory(entry.directory)
      await onStep?.({ phase: 'committed', index: entry.index, path: entry.targetPath })
    }
  } catch (error) {
    const rollbackErrors = await rollbackReleaseEntries(entries, onStep)
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `release transaction failed and rollback was incomplete: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    throw error
  }

  await cleanupReleaseEntries(entries, onStep)
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readPluginPackageManifests(rootDir) {
  return new Map(await Promise.all(pluginWorkspaces.map(async ({ workspace }) => [
    workspace,
    await readJson(path.join(rootDir, workspace, 'package.json')),
  ])))
}

async function writeSyncedFile(filePath, content, mode) {
  let created = false
  let handle
  try {
    handle = await open(filePath, 'wx', mode)
    created = true
    await handle.writeFile(content)
    await handle.sync()
    await handle.close()
    handle = null
  } catch (error) {
    const cleanupErrors = []
    if (handle) {
      try {
        await handle.close()
      } catch (closeError) {
        cleanupErrors.push(closeError)
      }
    }
    if (created) {
      try {
        await rm(filePath, { force: true })
      } catch (removeError) {
        cleanupErrors.push(removeError)
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], `could not prepare ${filePath}`)
    }
    throw error
  }
}

async function syncDirectory(directory) {
  let handle
  try {
    handle = await open(directory, 'r')
    await handle.sync()
  } catch (error) {
    if (process.platform !== 'win32' || !['EINVAL', 'ENOTSUP', 'EPERM'].includes(error?.code)) throw error
  } finally {
    await handle?.close()
  }
}

async function syncFile(filePath) {
  const handle = await open(filePath, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function rollbackReleaseEntries(entries, onStep) {
  const errors = []

  for (const entry of [...entries].reverse()) {
    let preserveBackup = false
    if (entry.committed) {
      try {
        await restoreReleaseEntry(entry, onStep)
      } catch (error) {
        errors.push(error)
        preserveBackup = true
      }
    }

    for (const [artifactPath, readyKey] of [
      [entry.tempPath, 'tempReady'],
      [entry.restorePath, 'restoreReady'],
    ]) {
      if (!entry[readyKey]) continue
      try {
        await rm(artifactPath, { force: true })
        entry[readyKey] = false
      } catch (error) {
        errors.push(error)
      }
    }

    if (!preserveBackup && entry.backupReady) {
      try {
        await rm(entry.backupPath, { force: true })
        entry.backupReady = false
      } catch (error) {
        errors.push(error)
      }
    }
  }

  await syncReleaseDirectories(entries, errors)
  return errors
}

async function restoreReleaseEntry(entry, onStep) {
  try {
    if (!entry.backupReady) throw new Error('release backup is unavailable')
    await onStep?.({ phase: 'before-backup-restore', index: entry.index, path: entry.targetPath })
    await rename(entry.backupPath, entry.targetPath)
    entry.backupReady = false
  } catch (backupError) {
    try {
      if (!entry.originalContent) throw new Error('release backup content is unavailable')
      await writeSyncedFile(entry.restorePath, entry.originalContent, entry.mode)
      entry.restoreReady = true
      await rm(entry.targetPath, { force: true })
      await rename(entry.restorePath, entry.targetPath)
      entry.restoreReady = false
      await rm(entry.backupPath, { force: true })
      entry.backupReady = false
    } catch (restoreError) {
      throw new AggregateError(
        [backupError, restoreError],
        `could not restore ${entry.targetPath}`,
      )
    }
  }

  entry.committed = false
  await syncDirectory(entry.directory)
}

async function cleanupReleaseEntries(entries, onStep) {
  const errors = []
  for (const entry of entries) {
    try {
      await onStep?.({ phase: 'before-cleanup', index: entry.index, path: entry.targetPath })
    } catch (error) {
      errors.push(error)
      continue
    }

    for (const [artifactPath, readyKey] of [
      [entry.tempPath, 'tempReady'],
      [entry.restorePath, 'restoreReady'],
      [entry.backupPath, 'backupReady'],
    ]) {
      if (!entry[readyKey]) continue
      try {
        await rm(artifactPath, { force: true })
        entry[readyKey] = false
      } catch (error) {
        errors.push(error)
      }
    }
  }

  await syncReleaseDirectories(entries, errors)
  if (errors.length > 0) {
    const preservedBackups = entries
      .filter(({ backupReady }) => backupReady)
      .map(({ backupPath }) => backupPath)
    const suffix = preservedBackups.length > 0
      ? `; preserved backups: ${preservedBackups.join(', ')}`
      : ''
    throw new AggregateError(
      errors,
      `release transaction committed but cleanup was incomplete${suffix}`,
    )
  }
}

async function syncReleaseDirectories(entries, errors = null) {
  const directories = [...new Set(entries.map(({ directory }) => directory))]
  for (const directory of directories) {
    try {
      await syncDirectory(directory)
    } catch (error) {
      if (errors) errors.push(error)
      else throw error
    }
  }
}

function printPlan(result) {
  writeLine(process.stdout, result.options.apply ? 'release plan:' : 'dry-run release plan:')
  for (const change of result.changes) {
    writeLine(process.stdout, `- ${change.file} ${change.field}: ${change.from} -> ${change.to}`)
  }
}

function printHelp() {
  writeLine(process.stdout, `Usage: node scripts/release.js --plugin <name|all> (--version <x.y.z>|--bump patch|minor|major) [--catalog-bump patch|minor|major] [--apply] [--allow-downgrade]\n\nThe marketplace always tracks GitHub main: catalog refs are removed from released entries. A scoped public catalog change may bump marketplace metadata explicitly with --catalog-bump.`)
}

function writeLine(stream, value) {
  writeSync(stream.fd, `${value}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}
