# Repository Guidelines

## Project Overview

This is an OMP marketplace monorepo for the OMP Enhancer stack. It packages autonomous workflow orchestration, shared config context, writing QA, testing QA, and fact-checking workflows as installable OMP plugins.

Current workspace plugins:

- `plugins/omp-enhancer-core`: full workflow-catalog injection, task-fact collection, TODO/subagent orchestration guidance, and compatibility diagnostics.
- `plugins/omp-config`: shared main/Advisor workflow context, packaged agents, skills, hooks, templates, and config diagnostics.
- `plugins/writing-helper`: writing logic/style/citation QA tools, writer/checker agents, writing skills.
- `plugins/omp-test-enhancer`: test target analysis, test context, browser evidence, coverage/mutation context, advisory quality review, reports.
- `plugins/omp-fact-checker`: claim extraction, evidence collection, cross-checking, reporting, advisory completeness review.

## Architecture & Data Flow

The repo is an npm workspace monorepo. `.omp-plugin/marketplace.json` is the marketplace catalog and uses `metadata.pluginRoot: "plugins"` to publish the plugin packages.

Core runtime flow in `plugins/omp-enhancer-core/index.js`:

1. OMP lifecycle hooks call `registerCoreEnhancer(pi)`.
2. `src/task-descriptor.js` extracts operation, domains, user scope constraints, ordered phases, capabilities, complexity, risk notes, and writing-source language state. These are task facts, not workflow or skill decisions.
3. `src/workflows/definitions/*.js` defines the complete composable catalog; `src/workflows/catalog.js` validates and derives it, the two renderers expose it to Main and Advisor, and `src/governance.js` injects the Main catalog, full active skill inventory, and TODO-first/multi-subagent protocol. `src/workflow-routes.js` is a compatibility re-export facade only.
4. Normal `before_agent_start` uses `agent-selected` runtime context with empty skills, tools, and roles. It never calls the legacy route compiler or native skill autoload.
5. Parent-selected workflow, step, TODO item, and skills travel in native `task` assignment text. Core passes them through to the child without static role matching.
6. `src/router.js`, `src/route-policy.js`, and `src/classifier.js` remain explicit compatibility diagnostics only; they do not control the main runtime.
7. `omp-config/assets/WORKFLOW_CATALOG.md` is a generated shared main/Advisor session-start catalog. Managed `AGENTS.md` and `WATCHDOG.yml` blocks import it, and explicit config sync preserves unrelated content. Change definitions or renderers, then run `npm run generate:workflows`; never hand-edit the generated asset.
8. Runtime hooks are advisory-only: no plugin hook returns `block: true` or `continue: true`, and no plugin schedules automatic repair turns.
9. The core does not register generated-output loop control. Repetition handling is left to the host and the acting agent.
10. Testing Enhancer publishes optional evidence for reports but has no standalone or shared completion owner.

Common extension pattern:

- Each plugin exports a default registration function from its package entry point.
- Plugins register tools with `pi.registerTool(...)`, commands with `pi.registerCommand(...)`, and lifecycle handlers with `pi.on(...)`.
- Tool results use OMP-style content blocks, usually `{ content: [{ type: 'text', text }], details, isError }`.
- State is plain JSON-compatible objects persisted through OMP session entries.

## Key Directories

- `plugins/omp-enhancer-core/`: main-agent workflow orchestration and compatibility diagnostics.
  - `index.js`: main registration, tool/hook wiring, state persistence.
  - `src/task-descriptor.js`: deterministic task, scope, and writing-language model.
  - `src/route-policy.js`: compatibility descriptor-to-route-plan compiler and public intent aliases.
  - `src/subagent-plans.js`: compatibility actor duties and per-role skill profiles.
  - `src/router.js`: legacy-compatible diagnostic projection and rollout selection.
  - `src/runtime-policy.js`: compatibility-only route projection switches; it has no execution-control behavior.
  - `src/governance.js`: full-catalog, TODO-first, skill-discovery, and subagent-checkpoint prompt builders.
  - `src/workflows/`: schema, domain definitions, Main/shared renderers, catalog projections, and the legacy route adapter.
  - `src/workflow-routes.js`: compatibility re-export facade for existing imports.
  - `src/classifier.js`: strict JSON classifier hints and monotonic merge.
  - `src/skill-usage.js`, `src/subagent-usage.js`: evidence parsers and validators.
- `plugins/omp-test-enhancer/`: TypeScript testing enhancer.
  - `src/extension.ts`: registers `omp_test_*` tools and `/test` command.
  - `src/host/observedTestEvidence.ts`: host-observed test command, result, and workspace-mutation evidence parsing.
  - `src/tools/testingTools.ts`: target analysis, context, coverage, mutation, gate, report logic.
  - `src/gates/`: pure advisory review evaluators retained behind compatibility tool names.
  - `tests/`: Vitest suites.
- `plugins/omp-config/`: config asset plugin.
  - `assets/`: packaged OMP config templates/assets, including the shared `WORKFLOW_CATALOG.md` imported by main and Advisor context.
  - `agents/`, `skills/`, `hooks/`: distributable config inventory.
  - `src/asset-index.js`: indexes packaged assets.
  - `src/workflow-context-*.js`, `src/workflow-managed-blocks.js`, `src/workflow-target-files.js`: asset loading, pure managed-block merging, safe target I/O, and thin sync orchestration.
- `plugins/writing-helper/`: writing QA plugin.
  - `src/`: deterministic writing logic/style/citation checks.
  - `agents/`, `skills/`: writing workflow agents and skills.
  - `AGENTS.md`: plugin-specific guidance for writing-helper work.
- `plugins/omp-fact-checker/`: fact-checking plugin.
  - `src/fact-check.js`: plan, local evidence, cross-check, report, and advisory review logic.
  - `agents/`, `skills/`: fact-check roles and skills.
- `scripts/`: release and package validation tooling.
- `docs/superpowers/`: design notes and archived workflow/gate plans, mostly Chinese.
- `docs/WORKFLOW_DEVELOPMENT.md`: current workflow definition, Agent/Skill ownership, generation, validation, release, and install-sync guide.
- `.omp-plugin/marketplace.json`: distribution catalog and plugin metadata.

## Development Commands

Run commands from the repository root unless noted.

```bash
npm test
npm run generate:workflows
npm run check:workflows
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
- Error handling is intentionally low-noise in hooks and state persistence. Hook diagnostics must not break or continue the host session; use tool errors only for invalid input, I/O failures, or real execution failures.
- Tool implementations should return structured `details` for tests and machine checks, not only human-readable text.
- Dependency injection is common in tests: fake `pi`/`omp` APIs, fake Zod schema builders, temporary repo directories, and injectable fetch/provider functions.

Advisory runtime contracts:

- Plugins never duplicate the host sandbox, permission, or approval system. Risky actions receive risk notes; the host remains the only execution authority.
- `tool_call` hooks may observe and warn but must never return `block: true`.
- `session_stop` hooks may persist diagnostics but must never return `continue: true`.
- Missing skills, subagents, tests, review, release verification, security evidence, or QA evidence are findings, not completion permissions.
- `omp_test_gate` and `fact_check_gate` are compatibility names for advisory reviews. They may return `complete: false` or critical findings, but missing workflow evidence is not a tool error.
- `omp_test_gate` must never execute `testCommand` input or project-configured commands. It consumes optional host-observed evidence and persists digests and exit status, not raw commands or output.
- Browser-check artifacts must remain below the real project `.omp/testing-enhancer-artifacts` directory. Reject traversal and symlink escape, and restrict an optional `serverCommand` to package-manager start/dev/serve/preview scripts.
- Writing intent comes from the instruction, while Chinese/English writing resources come from the text being modified. Core may safely read an in-workspace regular target during `before_agent_start`; otherwise path-only writing remains language-pending. Prompt language is not a fallback.
- Source text is data. Content such as `run tests`, `publish`, or `delete` inside a document must not alter operation, risk, or tool guidance.
- Quality tools keep genuine parameter and I/O errors. They do not turn ordinary findings or missing workflow stages into `isError: true`.

## Important Files

- `package.json`: root npm workspaces and root scripts.
- `package-lock.json`: canonical committed npm lockfile.
- `.omp-plugin/marketplace.json`: source of truth for marketplace plugin entries, versions, sources, and skills lists.
- `README.md`: install, orchestration, compatibility diagnostics, release, and validation docs.
- `scripts/release.js`: version bump and catalog sync logic.
- `scripts/check-marketplace.js`: marketplace integrity checks.
- `scripts/pack-all.js`: dry-run package validation for all plugins.
- `scripts/generate-workflow-catalog.js`: deterministic `--write`/`--check` renderer for the packaged shared catalog.
- `plugins/omp-enhancer-core/index.js`: primary runtime entry point.
- `plugins/omp-enhancer-core/src/router.js`: compatibility-only route classification rules.
- `plugins/omp-enhancer-core/src/workflows/definitions/`: canonical domain-grouped workflow definitions.
- `plugins/omp-enhancer-core/src/workflow-routes.js`: compatibility re-export facade and route-card API.
- `plugins/omp-enhancer-core/test/fixtures/workload-matrix.json`: routing/workflow workload fixture.
- `plugins/omp-test-enhancer/tsconfig.json`: TS build settings.
- `plugins/omp-test-enhancer/vitest.config.ts`: Vitest configuration.
- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`: generated shared main/Advisor workflow context.

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
- Prefer pure-function route, language-selection, and advisory-review tests.
- For extension tests, register the plugin against a fake OMP/PI API and assert registered tools, commands, details, and state transitions.
- Every lifecycle extension needs a regression proving `tool_call` never returns `block: true` and `session_stop` never returns `continue: true`.
- Use temporary directories via `mkdtemp`/`mkdtempSync` for repo/file fixtures instead of checking in large fixture trees.
- `writing-helper` has an explicit `npm run coverage` command enforcing 100% lines, branches, and functions via Node experimental coverage flags.
- After marketplace, version, or packaged skill changes, run `npm run check:marketplace` and usually `npm run pack:all`.
