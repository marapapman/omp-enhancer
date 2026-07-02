# Repository Guidelines

## Project Overview

`writing-helper` is a standalone OMP writing-helper plugin. It registers deterministic writing QA tools and slash commands for logic, style, and citation checks, and bundles frugal-pi/Pi-compatible writer/checker agents and writing/research skills.

Public surfaces:

- OMP tools: `writing_logic_check`, `writing_quality_check`
- Slash commands: `/writing-logic paper.md`, `/writing-quality paper.md`
- Package entrypoint: `index.js`, exported as the package root and declared in `package.json` under `omp.extensions`

## Architecture & Data Flow

The runtime is a small Node ESM pipeline with `index.js` as the composition root.

- `index.js` adapts the OMP host API, builds Zod schemas from `omp.zod.z`, registers tools and commands, parses slash-command flags, reads optional evidence files, and returns OMP-compatible responses.
- Logic flow: input `text` or UTF-8 `path` -> `src/document-loader.js` -> `src/analyzer.js` -> `src/report.js`.
- Quality flow: input -> document load -> evidence discovery/enrichment -> `src/quality.js` -> optional citation network lookup -> second quality pass -> report formatting.
- Citation flow: `src/citations.js` extracts Markdown citations, LaTeX `\cite{...}`, DOI strings/URLs, and arXiv IDs/URLs; compares against BibTeX and local literature records; marks citations `VERIFIED`, `MISMATCH`, or `UNVERIFIED`.
- The code is intentionally deterministic. Logic and style checks are regex/string heuristics over plain text, not model calls.
- Most code is synchronous. The main async path is `runWritingQualityCheck()` because citation evidence may use `globalThis.fetch`.

Error handling pattern:

- Core boundaries return plain result objects such as `{ ok: true, report, details }` or `{ ok: false, report, details }`.
- Extension tool handlers convert failure results to `isError: true` instead of throwing through the OMP boundary.
- Network lookup failures degrade to missing evidence, not fabricated certainty.

## Key Directories

- `src/` - deterministic analyzers, citation verification, language detection, document loading, and report formatting.
- `test/` - flat Node test suite, `*.test.js` files only.
- `agents/` - bundled English and Chinese writer/checker role prompts.
- `skills/` - bundled writing, review, research, formatting, and Chinese writing skills; each skill lives at `skills/<name>/SKILL.md`.
- Root files: `index.js`, `package.json`, `README.md`, and this `AGENTS.md`.

There are no committed `docs/`, `scripts/`, `examples/`, `.github/`, `CONTRIBUTING*`, `CLAUDE.md`, or `GEMINI.md` files in this snapshot.

## Development Commands

Use npm. No lockfile or package-manager pin is committed.

```bash
npm test
npm run coverage
omp plugin link --dry-run --json /absolute/path/to/writing-helper
npm pack --dry-run
```

Defined package scripts:

- `npm test` -> `node --test test/*.test.js`
- `npm run coverage` -> Node's experimental test coverage with 100% line, branch, and function thresholds for `index.js` and `src/**/*.js`

No `build`, `dev`, `lint`, `format`, or `typecheck` script exists. There is no transpilation or bundling step.

## Code Conventions & Common Patterns

- Plain JavaScript ESM only. Use `import`/`export`, explicit `.js` relative imports, and `node:` built-in specifiers.
- Match existing style: single quotes, semicolons, trailing commas in multiline literals, camelCase functions, kebab-case filenames such as `document-loader.js`.
- Prefer small pure functions returning plain objects. Avoid classes, service locators, global stores, or hidden mutable state unless there is a clear reason.
- Keep OMP host integration in `index.js`; keep deterministic analysis logic in `src/` modules.
- Use parameter-based dependency injection:
  - OMP host via `writingLogicExtension(omp)`
  - working directory via `ctx.cwd`
  - UI notifications via optional `ctx.ui.notify`
  - network lookup via injectable `fetchImpl` or `globalThis.fetch`
- Preserve conservative citation semantics. A citation is only `VERIFIED` when evidence confirms it; otherwise use `MISMATCH` for contradictions or `UNVERIFIED` for insufficient evidence.
- Keep document input boundaries clear. The plugin reads inline text or UTF-8 text files. It does not parse binary `.docx` or `.pdf` files.
- Style/report text is bilingual in places. Preserve Chinese wording and no-em-dash expectations where tests assert them.
- Bundled prompt content is compatibility-sensitive. Do not rename `agents/*.md` or `skills/*/SKILL.md` paths without updating package-content tests.

Common implementation shape:

```js
export function analyzeThing(input = {}) {
  const issues = [];
  // deterministic checks
  return { ok: true, issues, summary };
}
```

## Important Files

- `index.js` - package entrypoint, OMP tool/command registration, command flag parsing, evidence file discovery, exported runner functions.
- `src/analyzer.js` - writing logic heuristics and verdict summaries.
- `src/quality.js` - orchestrates logic, style, and citation checks.
- `src/citations.js` - citation extraction, BibTeX/local literature parsing, metadata comparison, optional Crossref/arXiv lookup.
- `src/style.js` - Chinese and English style-pattern rules.
- `src/document-loader.js` - inline text vs relative/absolute UTF-8 path loading.
- `src/language.js` - `zh`/`en` auto-detection by CJK and Latin character counts.
- `src/report.js` - Markdown-like human report formatting.
- `test/index.test.js` - highest-level extension/tool/command behavior tests.
- `test/branch-coverage.test.js` - defensive branch coverage for parser defaults and edge cases.
- `test/plugin-content.test.js` - packaging invariants for bundled agents and skills.
- `README.md` - user-facing tool surface, citation model, package layout, and validation commands.

## Runtime/Tooling Preferences

- Runtime: Node.js ESM. No Node version is pinned in-repo.
- Package manager: npm by documented commands; no lockfile is committed.
- Dependencies: `package.json` declares no runtime or dev dependencies.
- Test framework: Node built-ins only, especially `node:test`, `node:assert`, and `node:test`'s `mock` helper.
- Formatting/linting: no ESLint, Prettier, Biome, TypeScript, Jest, Vitest, Playwright, Cypress, bundler config, or CI workflow is present.
- OMP host expectations: the host supplies `omp.registerTool`, `omp.registerCommand`, `omp.zod.z`, `ctx.cwd`, and optionally `ctx.ui.notify`.
- External citation lookup is local-first. Network fallback is controlled by `allowNetwork` and `citationProviders`; `--no-network` and `--disable-network` must prevent remote calls.

## Testing & QA

Run the smallest relevant Node test first, then coverage when touching executable source.

Examples:

```bash
node --test test/citations.test.js
node --test test/index.test.js test/branch-coverage.test.js
npm test
npm run coverage
```

Testing patterns:

- Tests are flat under `test/*.test.js` and use `describe`/`it` from `node:test` plus strict assertions from `node:assert`.
- Tests synthesize temp files with `mkdtempSync` and `writeFileSync`; there is no committed fixture directory.
- Network behavior is tested by injecting `fetchImpl` or temporarily replacing `globalThis.fetch` and restoring it in `finally`.
- Assertions target structured results and exact report behavior, not snapshots.
- `test/index.test.js` and `test/branch-coverage.test.js` cover extension registration, slash-command parsing, evidence auto-discovery, network flags, and defensive/default branches.
- Coverage script enforces 100% lines, branches, and functions for `index.js` and `src/**/*.js`; new executable code usually needs targeted branch tests.

Packaging QA:

- Run `omp plugin link --dry-run --json /absolute/path/to/writing-helper` when changing extension metadata or package layout.
- Run `npm pack --dry-run` when changing bundled `agents/`, `skills/`, or package metadata.
