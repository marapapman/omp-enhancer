# Repository Guidelines

## Project Overview

This is an OMP marketplace monorepo for the OMP Enhancer stack. It packages runtime routing, config assets, writing QA, testing QA, and fact-checking workflows as installable OMP plugins.

Current workspace plugins:

- `plugins/omp-enhancer-core`: runtime router, governance prompt injection, skill/subagent gates, smart gates, loop guard.
- `plugins/omp-config`: packaged agents, skills, hooks, templates, and config diagnostics.
- `plugins/writing-helper`: writing logic/style/citation QA tools, writer/checker agents, writing skills.
- `plugins/omp-test-enhancer`: test target analysis, test context, browser evidence, coverage/mutation context, quality gates, reports.
- `plugins/omp-fact-checker`: claim extraction, evidence collection, cross-checking, reporting, fact-check gate.

## Architecture & Data Flow

The repo is an npm workspace monorepo. `.omp-plugin/marketplace.json` is the marketplace catalog and uses `metadata.pluginRoot: "plugins"` to publish the plugin packages.

Core runtime flow in `plugins/omp-enhancer-core/index.js`:

1. OMP lifecycle hooks call `registerCoreEnhancer(pi)`.
2. Natural-language prompts route through `src/router.js` into an intent/workflow route.
3. `src/workflow-routes.js` maps routes such as `code.dev`, `code.debug`, `writing.zh`, `factcheck.document`, `security.review`, and `omp.plugin` to required skills, tools, gates, and subagents.
4. `src/governance.js` injects route-specific guidance into agent prompts.
5. Tool calls and task/subagent events update serialized session state entries.
6. Completion gates validate required evidence such as `SKILL_USAGE`, `SUBAGENT_USAGE`, testing evidence, writing QA evidence, or fact-check reports.
7. `src/smart-gate.js` can build strict JSON review prompts for low-noise completion checks.
8. `src/loop-guard.js` watches assistant output for repeated sentence/phrase loops and can emit recovery context.

Common extension pattern:

- Each plugin exports a default registration function from its package entry point.
- Plugins register tools with `pi.registerTool(...)`, commands with `pi.registerCommand(...)`, and lifecycle handlers with `pi.on(...)`.
- Tool results use OMP-style content blocks, usually `{ content: [{ type: 'text', text }], details, isError }`.
- State is plain JSON-compatible objects persisted through OMP session entries.

## Key Directories

- `plugins/omp-enhancer-core/`: core routing and gate state machine.
  - `index.js`: main registration, tool/hook wiring, state persistence.
  - `src/router.js`: heuristic natural-language classifier.
  - `src/governance.js`: prompt and gate context builders.
  - `src/classifier.js`: strict JSON classifier prompt/schema builder.
  - `src/smart-gate.js`: strict JSON smart-gate prompt/schema builder.
  - `src/skill-usage.js`, `src/subagent-usage.js`: evidence parsers and validators.
- `plugins/omp-test-enhancer/`: TypeScript testing enhancer.
  - `src/extension.ts`: registers `omp_test_*` tools and `/test` command.
  - `src/tools/testingTools.ts`: target analysis, context, coverage, mutation, gate, report logic.
  - `src/gates/`: pure gate evaluators.
  - `tests/`: Vitest suites.
- `plugins/omp-config/`: config asset plugin.
  - `assets/`: packaged OMP config templates/assets.
  - `agents/`, `skills/`, `hooks/`: distributable config inventory.
  - `src/asset-index.js`: indexes packaged assets.
- `plugins/writing-helper/`: writing QA plugin.
  - `src/`: deterministic writing logic/style/citation checks.
  - `agents/`, `skills/`: writing workflow agents and skills.
  - `AGENTS.md`: plugin-specific guidance for writing-helper work.
- `plugins/omp-fact-checker/`: fact-checking plugin.
  - `src/fact-check.js`: plan, local evidence, cross-check, report, gate logic.
  - `agents/`, `skills/`: fact-check roles and skills.
- `scripts/`: release and package validation tooling.
- `docs/superpowers/`: design notes and archived workflow/gate plans, mostly Chinese.
- `.omp-plugin/marketplace.json`: distribution catalog and plugin metadata.

## Development Commands

Run commands from the repository root unless noted.

```bash
npm test
npm run check:marketplace
npm run pack:all
npm run release -- --plugin all --bump patch --dry-run
npm run release -- --plugin all --bump patch --apply
```

Plugin-specific commands:

```bash
cd plugins/omp-enhancer-core && npm test
cd plugins/omp-config && npm test
cd plugins/omp-config && npm run pack:dry
cd plugins/writing-helper && npm test
cd plugins/writing-helper && npm run coverage
cd plugins/omp-fact-checker && npm test
cd plugins/omp-test-enhancer && bun run typecheck
cd plugins/omp-test-enhancer && bun run build
cd plugins/omp-test-enhancer && bun run test
```

Release workflow from `README.md`:

```bash
npm run release -- --plugin all --bump patch --apply
npm test
npm run check:marketplace
npm run pack:all
```

Use `--dry-run` before `--apply` when changing versions or marketplace catalog entries.

## Code Conventions & Common Patterns

- ES modules everywhere. Use `import`/`export`, not CommonJS.
- Pure JavaScript plugins execute directly in Node. Do not add a build step outside `omp-test-enhancer` unless necessary.
- `omp-test-enhancer` is TypeScript with `module: NodeNext`, `target: ES2022`, `strict: true`, `rootDir: src`, `outDir: dist`.
- Preserve local style:
  - Core/config/fact-checker/writing-helper JS generally uses semicolons.
  - `omp-test-enhancer` TS currently uses no semicolons in many files.
- Public tool names are snake_case, for example `omp_core_route_task` and `omp_test_gate`.
- Internal functions are camelCase. Boolean predicates commonly use `isXxx`/`hasXxx`; builders use `buildXxx`; formatters use `formatXxx`; parsers use `parseXxx`.
- Prefer small pure functions plus plain objects. Source code is mostly function-based, not class-based.
- Keep plugin state JSON-serializable. Session state is restored from OMP entries and updated by lifecycle events.
- Validate and normalize tool params before use. Existing code often accepts missing params by defaulting to empty objects or strings.
- Error handling is intentionally low-noise in hooks and state persistence. Many hook failures are converted to gate context or swallowed to avoid breaking the host session; do not replace that with noisy throws unless the tool contract requires it.
- Tool implementations should return structured `details` for tests and machine checks, not only human-readable text.
- Dependency injection is common in tests: fake `pi`/`omp` APIs, fake Zod schema builders, temporary repo directories, and injectable fetch/provider functions.

## Important Files

- `package.json`: root npm workspaces and root scripts.
- `package-lock.json`: canonical committed npm lockfile.
- `.omp-plugin/marketplace.json`: source of truth for marketplace plugin entries, versions, sources, and skills lists.
- `README.md`: install, routing, classifier, release, and validation docs.
- `scripts/release.js`: version bump and catalog sync logic.
- `scripts/check-marketplace.js`: marketplace integrity checks.
- `scripts/pack-all.js`: dry-run package validation for all plugins.
- `plugins/omp-enhancer-core/index.js`: primary runtime entry point.
- `plugins/omp-enhancer-core/src/router.js`: route classification rules.
- `plugins/omp-enhancer-core/src/workflow-routes.js`: route catalog and route cards.
- `plugins/omp-enhancer-core/test/fixtures/workload-matrix.json`: routing/workflow workload fixture.
- `plugins/omp-test-enhancer/tsconfig.json`: TS build settings.
- `plugins/omp-test-enhancer/vitest.config.ts`: Vitest configuration.
- `plugins/omp-config/assets/CLAUDE.md`: packaged comprehensive agent instructions.

## Runtime/Tooling Preferences

- npm is canonical for the monorepo. `package-lock.json` is committed.
- Bun is used for `omp-test-enhancer` TypeScript tooling through `bunx`/`bun run`; `bun.lock` is gitignored and should not be treated as canonical.
- No root lint, format, or CI config is present. Match existing formatting and run targeted tests/checks.
- No package declares `engines` or `packageManager`; assume a modern Node.js runtime that supports ESM and `node:test`.
- Four plugins are dependency-light or dependency-free ESM JS. Avoid adding dependencies unless they clearly reduce risk.
- `omp-test-enhancer` legitimately depends on Playwright, pixelmatch, pngjs, TypeScript, Vitest, and Node types.
- Marketplace releases use track-main by default. Avoid adding pinned `ref` fields unless intentionally creating immutable archival releases.

## Testing & QA

Test stacks:

- Node built-in `node:test` plus `node:assert/strict` for pure JS plugins.
- Vitest for `plugins/omp-test-enhancer`.
- Pytest only inside `plugins/omp-config/skills/ecc/skill-comply/`.

Targeted test commands:

```bash
cd plugins/omp-enhancer-core && node --test test/*.test.js
cd plugins/omp-config && node --test test/*.test.js
cd plugins/omp-fact-checker && node --test test/*.test.js
cd plugins/writing-helper && node --test test/*.test.js
cd plugins/omp-test-enhancer && bunx vitest run
cd plugins/omp-config/skills/ecc/skill-comply && pytest
```

Patterns to follow:

- Keep tests inside each plugin's `test/` or `tests/` directory.
- Use `*.test.js` for `node:test`, `*.test.ts` for Vitest, and `test_*.py` for pytest.
- Prefer pure-function gate tests for routing/gate logic.
- For extension tests, register the plugin against a fake OMP/PI API and assert registered tools, commands, details, and state transitions.
- Use temporary directories via `mkdtemp`/`mkdtempSync` for repo/file fixtures instead of checking in large fixture trees.
- `writing-helper` has an explicit `npm run coverage` command enforcing 100% lines, branches, and functions via Node experimental coverage flags.
- After marketplace, version, or packaged skill changes, run `npm run check:marketplace` and usually `npm run pack:all`.
