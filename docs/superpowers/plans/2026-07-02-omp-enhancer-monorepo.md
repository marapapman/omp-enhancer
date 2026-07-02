# omp-enhancer Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `omp-enhancer` as a monorepo marketplace that installs `omp-config`, `writing-helper`, and `omp-testing-enhancer` with one `omp plugin install` command and supports `omp plugin upgrade`.

**Architecture:** The root repository is a marketplace catalog and workspace only. Each plugin lives under `plugins/<name>` with its own package, README, tests, and runtime entry. The three plugins do not import each other and do not share runtime source code.

**Tech Stack:** Node ESM for `writing-helper` and `omp-config`; Bun, TypeScript, and Vitest for `omp-test-enhancer`; OMP marketplace catalog at `.omp-plugin/marketplace.json`; npm workspaces at the root.

## Global Constraints

- Root repository must not register an OMP extension.
- Root marketplace must define `metadata.pluginRoot: "plugins"`.
- One install command must install all three plugins: `omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer`.
- Marketplace upgrade must support `omp plugin upgrade` and `omp plugin upgrade omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer`.
- `plugins/omp-config` must not import `plugins/writing-helper` or `plugins/omp-test-enhancer`.
- `plugins/writing-helper` must not import `plugins/omp-config` or `plugins/omp-test-enhancer`.
- `plugins/omp-test-enhancer` must not import `plugins/omp-config` or `plugins/writing-helper`.
- `plugins/omp-config` must not automatically overwrite `~/.omp` files.
- `plugins/writing-helper` keeps existing tool names: `writing_logic_check` and `writing_quality_check`.
- `plugins/omp-test-enhancer` keeps existing plugin name and package name: `omp-testing-enhancer`.
- Existing `omp-writing-helper` tests must continue to pass: 82 tests passing.
- `omp-test-enhancer` keeps Bun, TypeScript, Vitest, and its current command and tool names.

---

## File Structure

Create or modify these files:

```text
package.json
README.md
.omp-plugin/marketplace.json
scripts/check-marketplace.js
scripts/pack-all.js
plugins/omp-config/package.json
plugins/omp-config/README.md
plugins/omp-config/index.js
plugins/omp-config/src/doctor.js
plugins/omp-config/src/asset-index.js
plugins/omp-config/src/config-normalizer.js
plugins/omp-config/src/path-policy.js
plugins/omp-config/src/report.js
plugins/omp-config/test/doctor.test.js
plugins/omp-config/test/asset-index.test.js
plugins/omp-config/test/config-normalizer.test.js
plugins/omp-config/test/package-content.test.js
plugins/omp-config/commands/config.md
plugins/omp-config/commands/config-doctor.md
plugins/omp-config/commands/config-assets.md
plugins/omp-config/assets/CLAUDE.md
plugins/omp-config/assets/config.yml
plugins/omp-config/assets/models.yml
plugins/omp-config/assets/mcp.json
plugins/omp-config/assets/env.example
plugins/omp-config/assets/gitignore.root
plugins/omp-config/assets/gitignore.agent
plugins/writing-helper/*
plugins/omp-test-enhancer/*
```

`plugins/writing-helper/*` is moved from `omp-writing-helper` without code changes, except removing its standalone `.omp-plugin/marketplace.json` from the active marketplace path.

`plugins/omp-test-enhancer/*` is moved from `omp-test-enhancer` without code changes, except removing its standalone `.omp-plugin/marketplace.json` from the active marketplace path.

---

### Task 1: Root workspace and marketplace catalog

**Files:**
- Create: `package.json`
- Create: `README.md`
- Create: `.omp-plugin/marketplace.json`
- Create: `scripts/check-marketplace.js`

**Interfaces:**
- Produces: Root npm workspace over `plugins/omp-config`, `plugins/writing-helper`, `plugins/omp-test-enhancer`.
- Produces: Marketplace entries `omp-config`, `writing-helper`, `omp-testing-enhancer`.

- [ ] **Step 1: Create root package.json**

Write `package.json`:

```json
{
  "name": "omp-enhancer-monorepo",
  "private": true,
  "type": "module",
  "workspaces": [
    "plugins/omp-config",
    "plugins/writing-helper",
    "plugins/omp-test-enhancer"
  ],
  "scripts": {
    "test": "npm test --workspaces --if-present",
    "pack:all": "node scripts/pack-all.js",
    "check:marketplace": "node scripts/check-marketplace.js"
  }
}
```

- [ ] **Step 2: Create marketplace catalog**

Write `.omp-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "omp-enhancer",
  "owner": {
    "name": "marapapman"
  },
  "metadata": {
    "description": "OMP enhancement plugins for config assets, writing support, and test workflow support.",
    "version": "1.0.0",
    "pluginRoot": "plugins"
  },
  "plugins": [
    {
      "name": "omp-config",
      "description": "Pluginized OMP configuration assets, agents, skills, hooks, model override templates, and config diagnostics.",
      "version": "0.1.0",
      "category": "development",
      "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/omp-config",
      "repository": "https://github.com/marapapman/omp-enhancer",
      "source": "./omp-config"
    },
    {
      "name": "writing-helper",
      "description": "Standalone OMP writing helper with logic checks, quality checks, citation verification, writer/checker agents, and writing skills.",
      "version": "0.2.1",
      "category": "writing",
      "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/writing-helper",
      "repository": "https://github.com/marapapman/omp-enhancer",
      "source": "./writing-helper"
    },
    {
      "name": "omp-testing-enhancer",
      "description": "Help OMP agents write and check tests with target analysis, public API context, browser evidence, coverage and mutation analyzers, quality gates, and reports.",
      "version": "0.1.3",
      "category": "development",
      "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/omp-test-enhancer",
      "repository": "https://github.com/marapapman/omp-enhancer",
      "source": "./omp-test-enhancer"
    }
  ]
}
```

- [ ] **Step 3: Create marketplace checker**

Write `scripts/check-marketplace.js`:

```js
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const catalogPath = path.join(process.cwd(), '.omp-plugin', 'marketplace.json')
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))

const expected = [
  ['omp-config', './omp-config'],
  ['writing-helper', './writing-helper'],
  ['omp-testing-enhancer', './omp-test-enhancer']
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
```

- [ ] **Step 4: Run marketplace checker**

Run: `node scripts/check-marketplace.js`

Expected output:

```text
marketplace catalog ok
```

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json README.md .omp-plugin/marketplace.json scripts/check-marketplace.js
git commit -m "chore: add monorepo marketplace catalog"
```

---

### Task 2: Move writing-helper into the monorepo

**Files:**
- Create: `plugins/writing-helper/*`
- Remove from active marketplace path: `plugins/writing-helper/.omp-plugin/marketplace.json`

**Interfaces:**
- Produces: `plugins/writing-helper/package.json` with package name `writing-helper` and `omp.extensions: ["./index.js"]`.
- Produces: Existing tools `writing_logic_check` and `writing_quality_check`.

- [ ] **Step 1: Move repository contents**

Move every file from the cloned `omp-writing-helper` repository into `plugins/writing-helper/`.

- [ ] **Step 2: Remove standalone marketplace catalog from active plugin content**

If `plugins/writing-helper/.omp-plugin/marketplace.json` exists, move it to `plugins/writing-helper/docs/previous-marketplace.json` or delete it. Root `.omp-plugin/marketplace.json` is now authoritative.

- [ ] **Step 3: Verify package name and extension**

Check `plugins/writing-helper/package.json` contains:

```json
{
  "name": "writing-helper",
  "version": "0.2.1",
  "type": "module",
  "main": "index.js",
  "omp": {
    "extensions": [
      "./index.js"
    ]
  }
}
```

- [ ] **Step 4: Run writing-helper tests**

Run: `npm test -w plugins/writing-helper`

Expected output includes:

```text
# tests 82
# pass 82
# fail 0
```

- [ ] **Step 5: Commit**

Run:

```bash
git add plugins/writing-helper
git commit -m "chore: move writing-helper plugin into monorepo"
```

---

### Task 3: Move omp-test-enhancer into the monorepo

**Files:**
- Create: `plugins/omp-test-enhancer/*`
- Remove from active marketplace path: `plugins/omp-test-enhancer/.omp-plugin/marketplace.json`

**Interfaces:**
- Produces: package `omp-testing-enhancer`.
- Produces: command `/omp-testing-enhancer:test` through marketplace content.
- Produces: runtime command `/test` and tools `omp_test_*` when extension loading path is active.

- [ ] **Step 1: Move repository contents**

Move every file from the cloned `omp-test-enhancer` repository into `plugins/omp-test-enhancer/`.

- [ ] **Step 2: Remove standalone marketplace catalog from active plugin content**

If `plugins/omp-test-enhancer/.omp-plugin/marketplace.json` exists, move it to `plugins/omp-test-enhancer/docs/previous-marketplace.json` or delete it. Root `.omp-plugin/marketplace.json` is now authoritative.

- [ ] **Step 3: Verify package name and extension**

Check `plugins/omp-test-enhancer/package.json` contains:

```json
{
  "name": "omp-testing-enhancer",
  "version": "0.1.3",
  "type": "module",
  "main": "./dist/extension.js",
  "omp": {
    "extensions": [
      "./src/extension.ts"
    ]
  }
}
```

- [ ] **Step 4: Build and test testing plugin**

Run: `npm test -w plugins/omp-test-enhancer`

Expected: Vitest exits with status 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add plugins/omp-test-enhancer
git commit -m "chore: move testing enhancer plugin into monorepo"
```

---

### Task 4: Create omp-config plugin assets and package

**Files:**
- Create: `plugins/omp-config/package.json`
- Create: `plugins/omp-config/README.md`
- Create: `plugins/omp-config/index.js`
- Create: `plugins/omp-config/assets/*`
- Create: `plugins/omp-config/agents/*`
- Create: `plugins/omp-config/skills/*`
- Create: `plugins/omp-config/hooks/*`
- Create: `plugins/omp-config/commands/*.md`

**Interfaces:**
- Produces: package `omp-config`.
- Produces: commands `/omp-config:config`, `/omp-config:config-doctor`, `/omp-config:config-assets` through marketplace content.
- Produces: runtime tools `omp_config_doctor`, `omp_config_assets`, `omp_config_plan` when extension loading path is active.

- [ ] **Step 1: Copy config assets**

Copy these files from `omp-config` into `plugins/omp-config/assets/`:

```text
CLAUDE.md -> assets/CLAUDE.md
.gitignore -> assets/gitignore.root
agent/config.yml -> assets/config.yml
agent/models.yml -> assets/models.yml
agent/mcp.json -> assets/mcp.json
agent/.env.example -> assets/env.example
agent/.gitignore -> assets/gitignore.agent
```

- [ ] **Step 2: Copy installable content**

Copy these directories:

```text
omp-config/agent/agents -> plugins/omp-config/agents
omp-config/agent/skills -> plugins/omp-config/skills
omp-config/agent/hooks -> plugins/omp-config/hooks
```

- [ ] **Step 3: Create package.json**

Write `plugins/omp-config/package.json`:

```json
{
  "name": "omp-config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Pluginized OMP config assets, hooks, agents, skills, and diagnostics.",
  "main": "index.js",
  "exports": {
    ".": "./index.js"
  },
  "files": [
    "index.js",
    "src",
    "commands",
    "agents",
    "skills",
    "hooks",
    "assets",
    "package.json",
    "README.md"
  ],
  "scripts": {
    "test": "node --test test/*.test.js",
    "pack:dry": "npm pack --dry-run"
  },
  "omp": {
    "extensions": [
      "./index.js"
    ]
  },
  "pi": {
    "skills": [
      "./skills"
    ]
  },
  "license": "UNLICENSED"
}
```

- [ ] **Step 4: Create commands**

Write `plugins/omp-config/commands/config.md`:

```markdown
# OMP Config

This plugin provides OMP config assets, agents, skills, hooks, and safe config diagnostics.

Use:

- `/omp-config:config-doctor` to inspect config risks.
- `/omp-config:config-assets` to list packaged assets.

It does not automatically overwrite `~/.omp`.
```

Write `plugins/omp-config/commands/config-doctor.md`:

```markdown
# OMP Config Doctor

Run `omp_config_doctor` and report portability, model, hook, MCP, path, and secret risks.

Do not modify `~/.omp` unless the user explicitly asks for a patch plan and reviews it.
```

Write `plugins/omp-config/commands/config-assets.md`:

```markdown
# OMP Config Assets

Run `omp_config_assets` and list packaged agents, skills, hooks, and config templates.

Treat `assets/config.yml`, `assets/models.yml`, and `assets/mcp.json` as templates, not auto-install files.
```

- [ ] **Step 5: Commit**

Run:

```bash
git add plugins/omp-config
git commit -m "feat: add omp config plugin assets"
```

---

### Task 5: Implement omp-config diagnostics

**Files:**
- Create: `plugins/omp-config/src/path-policy.js`
- Create: `plugins/omp-config/src/config-normalizer.js`
- Create: `plugins/omp-config/src/asset-index.js`
- Create: `plugins/omp-config/src/doctor.js`
- Create: `plugins/omp-config/src/report.js`
- Create: `plugins/omp-config/index.js`
- Test: `plugins/omp-config/test/*.test.js`

**Interfaces:**
- Produces: `findPathRisks(text, path): Finding[]`
- Produces: `listAssets(root): Promise<AssetSummary>`
- Produces: `runConfigDoctor(root): Promise<DoctorResult>`
- Produces: extension tools `omp_config_doctor`, `omp_config_assets`, `omp_config_plan`.

- [ ] **Step 1: Write path policy tests**

Write `plugins/omp-config/test/config-normalizer.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { findPathRisks } from '../src/path-policy.js'

test('findPathRisks reports hardcoded root home paths', () => {
  const findings = findPathRisks('customDirectories:\n  - /root/.omp/skills\n', 'config.yml')
  assert.equal(findings.length, 1)
  assert.equal(findings[0].id, 'hardcoded-root-home')
  assert.equal(findings[0].severity, 'warning')
})
```

- [ ] **Step 2: Implement path policy**

Write `plugins/omp-config/src/path-policy.js`:

```js
export function findPathRisks(text, filePath) {
  const findings = []
  if (text.includes('/root/.omp') || text.includes('/root/.claude')) {
    findings.push({
      id: 'hardcoded-root-home',
      severity: 'warning',
      area: 'paths',
      path: filePath,
      problem: 'Config contains hardcoded /root home paths.',
      evidence: redactEvidence(text),
      suggestion: 'Replace /root paths with user home relative paths or documented local paths.',
      safeToAutoFix: false
    })
  }
  return findings
}

function redactEvidence(text) {
  return text
    .split('\n')
    .filter(line => line.includes('/root/.omp') || line.includes('/root/.claude'))
    .map(line => line.trim())
    .join('\n')
}
```

- [ ] **Step 3: Run path policy test**

Run: `npm test -w plugins/omp-config -- config-normalizer.test.js`

Expected: test passes.

- [ ] **Step 4: Implement doctor and extension entry**

Write `plugins/omp-config/src/doctor.js`:

```js
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { findPathRisks } from './path-policy.js'

export async function runConfigDoctor(root = process.cwd()) {
  const configPath = path.join(root, 'assets', 'config.yml')
  const text = await readFile(configPath, 'utf8')
  const findings = findPathRisks(text, 'assets/config.yml')
  return {
    ok: findings.length === 0,
    summary: findings.length === 0 ? 'No config risks found.' : `${findings.length} config risk(s) found.`,
    findings
  }
}
```

Write `plugins/omp-config/src/asset-index.js`:

```js
import { readdir } from 'node:fs/promises'
import path from 'node:path'

export async function listAssets(root = process.cwd()) {
  const pluginRoot = root.endsWith('omp-config') ? root : path.join(root, 'plugins', 'omp-config')
  const [agents, skills] = await Promise.all([
    safeList(path.join(pluginRoot, 'agents')),
    safeList(path.join(pluginRoot, 'skills'))
  ])
  return { agents, skills }
}

async function safeList(dir) {
  try {
    return (await readdir(dir)).filter(name => !name.startsWith('.')).sort()
  } catch {
    return []
  }
}
```

Write `plugins/omp-config/src/report.js`:

```js
export function formatDoctorReport(result) {
  const lines = [`# OMP Config Doctor`, '', result.summary]
  for (const finding of result.findings) {
    lines.push('', `## ${finding.id}`, '', `Severity: ${finding.severity}`, '', finding.problem, '', finding.suggestion)
  }
  return lines.join('\n')
}
```

Write `plugins/omp-config/index.js`:

```js
import { runConfigDoctor } from './src/doctor.js'
import { listAssets } from './src/asset-index.js'
import { formatDoctorReport } from './src/report.js'

export default function registerOmpConfig(pi) {
  const z = pi.zod.z
  pi.setLabel?.('OMP Config')

  pi.registerTool({
    name: 'omp_config_doctor',
    label: 'OMP Config Doctor',
    description: 'Inspect packaged OMP config assets and report portability risks.',
    parameters: z.object({ root: z.optional(z.string()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runConfigDoctor(params.root ?? ctx.cwd)
      return {
        content: [{ type: 'text', text: formatDoctorReport(result) }],
        details: result,
        isError: false
      }
    }
  })

  pi.registerTool({
    name: 'omp_config_assets',
    label: 'OMP Config Assets',
    description: 'List packaged OMP config agents and skills.',
    parameters: z.object({ root: z.optional(z.string()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await listAssets(params.root ?? ctx.cwd)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        details: result,
        isError: false
      }
    }
  })
}
```

- [ ] **Step 5: Run omp-config tests**

Run: `npm test -w plugins/omp-config`

Expected: all tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add plugins/omp-config
git commit -m "feat: add omp config diagnostics"
```

---

### Task 6: Validate one-command install and upgrade workflow

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-02-omp-enhancer-monorepo-design.md` only if validation changes the design.

**Interfaces:**
- Consumes: Root marketplace catalog from Task 1.
- Consumes: Three plugin packages from Tasks 2, 3, and 4.
- Produces: Verified install and upgrade commands documented in README.

- [ ] **Step 1: Write root README install section**

Write `README.md` with this install section:

````markdown
# omp-enhancer

This repository is an OMP marketplace monorepo containing three independent plugins.

## Plugins

- `omp-config`
- `writing-helper`
- `omp-testing-enhancer`

## Install

Add the marketplace once:

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

Install all three plugins with one OMP command:

```bash
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

Upgrade installed plugins:

```bash
omp plugin upgrade
```

Upgrade only these three plugins:

```bash
omp plugin upgrade omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```
````

- [ ] **Step 2: Run package tests**

Run:

```bash
npm test -w plugins/writing-helper
npm test -w plugins/omp-config
npm test -w plugins/omp-test-enhancer
```

Expected:

```text
plugins/writing-helper passes with 82 tests.
plugins/omp-config passes all node:test tests.
plugins/omp-test-enhancer vitest exits with status 0.
```

- [ ] **Step 3: Validate marketplace catalog**

Run: `node scripts/check-marketplace.js`

Expected:

```text
marketplace catalog ok
```

- [ ] **Step 4: Validate local marketplace install**

Run:

```bash
omp plugin marketplace add ./omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
omp plugin list
```

Expected: list output includes all three installed plugin identifiers.

- [ ] **Step 5: Validate upgrade command**

Run:

```bash
omp plugin upgrade omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

Expected: command exits with status 0. If there are no newer versions, output reports no upgrade or already current.

- [ ] **Step 6: Commit**

Run:

```bash
git add README.md docs/superpowers/specs/2026-07-02-omp-enhancer-monorepo-design.md
git commit -m "docs: document one-command install and upgrade"
```
