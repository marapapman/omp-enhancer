# Marketplace Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users install `omp-testing-enhancer` through an OMP marketplace entry and upgrade it with `omp plugin upgrade omp-testing-enhancer@omp-test-enhancer`.

**Architecture:** Add a first-party OMP marketplace catalog under `.omp-plugin/marketplace.json`. Point the package manifest at the TypeScript extension entry so marketplace GitHub source installs do not need a local build. Add a small release sync utility so the catalog version and GitHub source ref always match `package.json`. Update README to make marketplace install the default path.

**Tech Stack:** Bun, TypeScript, Vitest, OMP marketplace catalog JSON.

## Global Constraints

- Marketplace name: `omp-test-enhancer`.
- Plugin name: `omp-testing-enhancer`.
- Marketplace catalog path: `.omp-plugin/marketplace.json`.
- GitHub source repo: `marapapman/omp-test-enhancer`.
- `source.ref` must equal `v${packageJson.version}`.
- Catalog plugin `version` must equal `package.json` `version`.
- `package.json` `omp.extensions` must be `["./src/extension.ts"]`.
- `package.json` `files` must include `src` and `.omp-plugin`.
- README must recommend marketplace install and `omp plugin upgrade omp-testing-enhancer@omp-test-enhancer`.
- Keep `omp plugin link .` for local development.
- Add no runtime dependency.
- Follow TDD. Write the failing test first and verify the expected failure before implementation.

---

## File Structure

- Create `.omp-plugin/marketplace.json`. Owns the marketplace catalog shipped by this repo.
- Create `src/marketplace/marketplaceRelease.ts`. Owns pure catalog release sync logic and file read/write helpers.
- Create `scripts/sync-marketplace-release.ts`. Thin Bun entry point that calls the tested helper.
- Create `tests/unit/marketplace/marketplaceCatalog.test.ts`. Verifies catalog shape, package manifest, version sync, and README commands.
- Modify `package.json`. Points `omp.extensions` at `./src/extension.ts`, ships `src` and `.omp-plugin`, and adds `sync:marketplace`.
- Modify `README.md`. Makes marketplace install and upgrade the default user flow.

---

### Task 1: Add marketplace catalog and package manifest support

**Files:**
- Create: `tests/unit/marketplace/marketplaceCatalog.test.ts`
- Create: `.omp-plugin/marketplace.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `package.json` name and version.
- Produces: `.omp-plugin/marketplace.json` with marketplace name `omp-test-enhancer` and plugin ID `omp-testing-enhancer@omp-test-enhancer`.
- Produces: package manifest that marketplace source installs can load without building `dist`.

- [ ] **Step 1: Write the failing catalog and package manifest test**

Create `tests/unit/marketplace/marketplaceCatalog.test.ts` with this content.

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  name: string
  version: string
  files: string[]
  omp: { extensions: string[] }
}

interface MarketplaceCatalog {
  name: string
  owner: { name: string }
  plugins: Array<{
    name: string
    version: string
    source: { source: string; repo: string; ref: string }
  }>
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

describe('marketplace catalog', () => {
  it('publishes the plugin through the omp-test-enhancer marketplace', async () => {
    const root = process.cwd()
    const packageJson = await readJson<PackageJson>(join(root, 'package.json'))
    const catalog = await readJson<MarketplaceCatalog>(join(root, '.omp-plugin', 'marketplace.json'))
    const plugin = catalog.plugins[0]

    expect(catalog.name).toBe('omp-test-enhancer')
    expect(catalog.owner.name).toBe('marapapman')
    expect(plugin?.name).toBe(packageJson.name)
    expect(plugin?.version).toBe(packageJson.version)
    expect(plugin?.source).toEqual({
      source: 'github',
      repo: 'marapapman/omp-test-enhancer',
      ref: `v${packageJson.version}`
    })
  })

  it('ships a source extension entry that marketplace installs can load', async () => {
    const packageJson = await readJson<PackageJson>(join(process.cwd(), 'package.json'))

    expect(packageJson.omp.extensions).toEqual(['./src/extension.ts'])
    expect(packageJson.files).toEqual(expect.arrayContaining(['src', '.omp-plugin', 'package.json', 'README.md']))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bunx vitest run tests/unit/marketplace/marketplaceCatalog.test.ts
```

Expected: FAIL because `.omp-plugin/marketplace.json` does not exist and `package.json` still points `omp.extensions` at `./dist/extension.js`.

- [ ] **Step 3: Create the minimal marketplace catalog**

Create `.omp-plugin/marketplace.json` with this content.

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "omp-test-enhancer",
  "owner": {
    "name": "marapapman"
  },
  "metadata": {
    "description": "OMP plugins published by marapapman for test workflow support.",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "omp-testing-enhancer",
      "description": "Help OMP agents write and check tests with target analysis, public API context, quality gates, and reports.",
      "version": "0.1.1",
      "category": "development",
      "homepage": "https://github.com/marapapman/omp-test-enhancer",
      "repository": "https://github.com/marapapman/omp-test-enhancer",
      "source": {
        "source": "github",
        "repo": "marapapman/omp-test-enhancer",
        "ref": "v0.1.1"
      }
    }
  ]
}
```

- [ ] **Step 4: Update package manifest for marketplace loading**

Modify `package.json` so these fields match exactly.

```json
"files": [
  "dist",
  "src",
  ".omp-plugin",
  "package.json",
  "README.md"
],
"omp": {
  "extensions": [
    "./src/extension.ts"
  ]
}
```

Keep the existing `main`, `exports`, dependencies, and scripts unchanged in this task.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
bunx vitest run tests/unit/marketplace/marketplaceCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .omp-plugin/marketplace.json package.json tests/unit/marketplace/marketplaceCatalog.test.ts
git commit -m "feat: add marketplace install metadata"
```

---

### Task 2: Add release sync utility

**Files:**
- Modify: `tests/unit/marketplace/marketplaceCatalog.test.ts`
- Create: `src/marketplace/marketplaceRelease.ts`
- Create: `scripts/sync-marketplace-release.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `releaseTagForVersion(version: string): string`.
- Produces: `syncMarketplaceCatalogRelease(catalog: MarketplaceCatalog, packageJson: PackageMetadata): MarketplaceCatalog`.
- Produces: `syncMarketplaceRelease(cwd?: string): Promise<{ version: string; ref: string }>`.
- Consumes: `.omp-plugin/marketplace.json` and `package.json` from `cwd`.

- [ ] **Step 1: Add failing tests for sync behavior**

Append this import near the top of `tests/unit/marketplace/marketplaceCatalog.test.ts`.

```ts
import { releaseTagForVersion, syncMarketplaceCatalogRelease } from '../../../src/marketplace/marketplaceRelease.js'
```

Append these tests inside the existing `describe('marketplace catalog', () => { ... })` block.

```ts
  it('derives release tags from package versions', () => {
    expect(releaseTagForVersion('0.2.0')).toBe('v0.2.0')
  })

  it('syncs catalog plugin version and source ref without mutating the input', () => {
    const catalog: MarketplaceCatalog = {
      name: 'omp-test-enhancer',
      owner: { name: 'marapapman' },
      plugins: [
        {
          name: 'omp-testing-enhancer',
          version: '0.1.1',
          source: {
            source: 'github',
            repo: 'marapapman/omp-test-enhancer',
            ref: 'v0.1.1'
          }
        }
      ]
    }

    const synced = syncMarketplaceCatalogRelease(catalog, {
      name: 'omp-testing-enhancer',
      version: '0.2.0'
    })

    expect(synced.plugins[0]).toEqual({
      name: 'omp-testing-enhancer',
      version: '0.2.0',
      source: {
        source: 'github',
        repo: 'marapapman/omp-test-enhancer',
        ref: 'v0.2.0'
      }
    })
    expect(catalog.plugins[0]?.version).toBe('0.1.1')
    expect(catalog.plugins[0]?.source.ref).toBe('v0.1.1')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bunx vitest run tests/unit/marketplace/marketplaceCatalog.test.ts
```

Expected: FAIL because `src/marketplace/marketplaceRelease.js` cannot be resolved.

- [ ] **Step 3: Add the sync helper**

Create `src/marketplace/marketplaceRelease.ts` with this content.

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface PackageMetadata {
  name: string
  version: string
}

export interface MarketplaceSource {
  source: string
  repo: string
  ref: string
}

export interface MarketplacePlugin {
  name: string
  version: string
  source: MarketplaceSource
  [key: string]: unknown
}

export interface MarketplaceCatalog {
  name: string
  owner: { name: string; [key: string]: unknown }
  plugins: MarketplacePlugin[]
  [key: string]: unknown
}

export function releaseTagForVersion(version: string): string {
  const normalized = version.trim()
  if (!normalized) throw new Error('package version is empty')
  return normalized.startsWith('v') ? normalized : `v${normalized}`
}

export function syncMarketplaceCatalogRelease(
  catalog: MarketplaceCatalog,
  packageJson: PackageMetadata
): MarketplaceCatalog {
  const ref = releaseTagForVersion(packageJson.version)
  let found = false
  const plugins = catalog.plugins.map(plugin => {
    if (plugin.name !== packageJson.name) return plugin
    found = true
    return {
      ...plugin,
      version: packageJson.version,
      source: {
        ...plugin.source,
        ref
      }
    }
  })

  if (!found) throw new Error(`marketplace plugin ${packageJson.name} was not found`)
  return { ...catalog, plugins }
}

export async function syncMarketplaceRelease(cwd = process.cwd()): Promise<{ version: string; ref: string }> {
  const packagePath = join(cwd, 'package.json')
  const catalogPath = join(cwd, '.omp-plugin', 'marketplace.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as PackageMetadata
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as MarketplaceCatalog
  const synced = syncMarketplaceCatalogRelease(catalog, packageJson)
  await writeFile(catalogPath, `${JSON.stringify(synced, null, 2)}\n`)
  return { version: packageJson.version, ref: releaseTagForVersion(packageJson.version) }
}
```

- [ ] **Step 4: Add the Bun script entry point**

Create `scripts/sync-marketplace-release.ts` with this content.

```ts
import { syncMarketplaceRelease } from '../src/marketplace/marketplaceRelease.js'

const result = await syncMarketplaceRelease()
console.log(`Updated .omp-plugin/marketplace.json to ${result.ref}`)
```

- [ ] **Step 5: Add package script**

Modify `package.json` scripts to include `sync:marketplace`.

```json
"scripts": {
  "build": "bunx tsc -p tsconfig.json",
  "typecheck": "bunx tsc --noEmit -p tsconfig.json",
  "test": "bunx vitest run",
  "prepack": "bun run build",
  "sync:marketplace": "bun scripts/sync-marketplace-release.ts"
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
bunx vitest run tests/unit/marketplace/marketplaceCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the sync script**

Run:

```bash
bun run sync:marketplace
```

Expected output contains:

```text
Updated .omp-plugin/marketplace.json to v0.1.1
```

- [ ] **Step 8: Commit**

```bash
git add package.json src/marketplace/marketplaceRelease.ts scripts/sync-marketplace-release.ts tests/unit/marketplace/marketplaceCatalog.test.ts .omp-plugin/marketplace.json
git commit -m "feat: sync marketplace release metadata"
```

---

### Task 3: Update README marketplace install and upgrade flow

**Files:**
- Modify: `tests/unit/marketplace/marketplaceCatalog.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: marketplace ID `omp-testing-enhancer@omp-test-enhancer` from Task 1.
- Produces: README commands users can copy for install and upgrade.

- [ ] **Step 1: Add failing README command test**

Append this test inside `describe('marketplace catalog', () => { ... })`.

```ts
  it('documents marketplace install and upgrade commands', async () => {
    const readme = await readFile(join(process.cwd(), 'README.md'), 'utf8')

    expect(readme).toContain('omp plugin marketplace add marapapman/omp-test-enhancer')
    expect(readme).toContain('omp plugin install omp-testing-enhancer@omp-test-enhancer')
    expect(readme).toContain('omp plugin marketplace update omp-test-enhancer')
    expect(readme).toContain('omp plugin upgrade omp-testing-enhancer@omp-test-enhancer')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bunx vitest run tests/unit/marketplace/marketplaceCatalog.test.ts
```

Expected: FAIL because README still documents the GitHub release install path as the default.

- [ ] **Step 3: Replace README install section**

Replace the current `## 安装` and `## 升级` sections with this content.

````md
## 安装

推荐通过 OMP marketplace 安装。这样后续可以直接使用 `omp plugin upgrade` 升级。

先添加这个仓库作为 marketplace。

```bash
omp plugin marketplace add marapapman/omp-test-enhancer
```

然后安装插件。

```bash
omp plugin install omp-testing-enhancer@omp-test-enhancer
```

安装后检查插件列表。

```bash
omp plugin list
```

如果插件被禁用，可以重新启用。

```bash
omp plugin enable omp-testing-enhancer@omp-test-enhancer
```

然后重启 OMP 会话，输入：

```text
/test help
```

如果看到 `/test` 的帮助说明，说明插件已经加载成功。

## 升级

先更新 marketplace catalog。

```bash
omp plugin marketplace update omp-test-enhancer
```

然后升级插件。

```bash
omp plugin upgrade omp-testing-enhancer@omp-test-enhancer
```

如果你是本地开发安装，继续使用 `omp plugin link .`，不用走 marketplace 升级流程。
````

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
bunx vitest run tests/unit/marketplace/marketplaceCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/unit/marketplace/marketplaceCatalog.test.ts
git commit -m "docs: document marketplace upgrade flow"
```

---

### Task 4: Verify full project behavior

**Files:**
- No new files.
- Verify all files touched by Tasks 1 to 3.

**Interfaces:**
- Consumes: catalog, package manifest, sync script, README, tests.
- Produces: verified install flow documentation and passing test suite.

- [ ] **Step 1: Run targeted marketplace tests**

Run:

```bash
bunx vitest run tests/unit/marketplace/marketplaceCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
bun run test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Check package contents**

Run:

```bash
npm pack --dry-run
```

Expected output includes `src/extension.ts`, `.omp-plugin/marketplace.json`, `README.md`, `package.json`, and `dist/extension.js`.

- [ ] **Step 5: Commit packaging fix if needed**

Only run this if Step 4 shows a missing required package file.

```bash
git add package.json
git commit -m "build: include marketplace runtime files"
```
