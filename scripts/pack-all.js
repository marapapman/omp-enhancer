import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { pluginWorkspaces } from './plugin-workspaces.js'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

for (const { workspace } of pluginWorkspaces) {
  console.log(`\n=== npm pack --dry-run --workspace ${workspace} ===`)

  const result = spawnSync(
    'npm',
    ['pack', '--dry-run', '--workspace', workspace],
    {
      cwd: rootDir,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    }
  )

  if (result.error) {
    console.error(`Failed to run npm pack for ${workspace}: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    console.error(`npm pack failed for ${workspace} with exit code ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

console.log('\nall workspace packs ok')
