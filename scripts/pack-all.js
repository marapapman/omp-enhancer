import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaces = [
  'plugins/omp-config',
  'plugins/writing-helper',
  'plugins/omp-test-enhancer',
  'plugins/omp-enhancer-core',
  'plugins/omp-opencode-go-pool'
]

for (const workspace of workspaces) {
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
