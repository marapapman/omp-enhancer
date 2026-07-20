# Historical record: Skill resource path and compatibility-link repair

Date: 2026-07-19

Status: completed implementation snapshot. The plan, file sets, test counts,
cache versions, and link counts below record the 2026-07-19 repair and are not
current runtime instructions. For the current contract, see
[Architecture and runtime contracts](ARCHITECTURE.md).

Current discovery distinguishes four cases: only the exact native
`skill-prompt` body named `omp-enhancer-workflows` counts as a supplied index;
selected index `D` top-level URIs and enumerated nested ECC `C` URIs go directly
into PLAN/NOW; `skill://ecc-skill-catalog` is only the start of an unlisted
long-tail chain; and PLAN plus READY each begin at byte 0.

## Problem statement

The installed runtime exposes `zh-writing-polish`, but Main attempted to load the bare value as a generic file path instead of loading `skill://zh-writing-polish`. Advisor then searched a project `.agents/skills` directory and incorrectly generalized that local miss into a marketplace-wide absence claim. Separately, compatibility links under `~/.omp/skills` and `~/.omp/agent/managed-skills` still point at retired cache versions.

The repair must remain advisory. It must not introduce a router, gate, tool-call interceptor, automatic retry, directory-based inventory scan, workflow selection, or completion authority.

## Authority boundaries used for this repair

- Preserve all pre-existing dirty work. `plugins/omp-enhancer-core/index.js` already has an unrelated dead-code deletion near the bottom; prompt edits are confined to the reminder constants near the top.
- Native OMP inventory is the runtime source of truth for top-level Skills. A visible top-level Skill name `x` maps to the literal resource URI `skill://x`; the loaded workflow index may expose an enumerated nested ECC `C` URI directly, while a successfully loaded long-tail catalog may reveal another exact nested `skill://...` URI that Main copies literally.
- A generic `read` call with bare `x` is a project filesystem read, not a Skill load. Its failure proves only that the path/namespace was wrong.
- Only an explicit resolver failure for an exact URI declared from native inventory or the loaded workflow index, or visibly revealed by another loaded declared source, may be recorded as unavailable. Correcting a bare-path request to the declared exact URI is one changed request, not an unchanged retry.
- `.agents/skills`, `~/.agents/skills`, plugin source directories, and any single cache directory are partial authoring/install locations, not exhaustive runtime inventory.
- Advisor may make at most one early optional correction using visible evidence; it may not claim global absence from one directory, crawl inventories, route, block, retry, or restart Main.
- The user authorized refreshing local compatibility symlinks, but not publishing, releasing, version changes, commit, or push.
- Exact local transcript/runtime evidence identifies this repository-owned defect; external search is unnecessary for this repair.

## TDD slices

### S1: Core reminders and generated workflow index

Write set:

- `plugins/omp-enhancer-core/index.js`
- `plugins/omp-enhancer-core/src/workflows/render-skill.js`
- `plugins/omp-enhancer-core/test/core-workflow.e2e.test.js`
- `scripts/generate-workflow-catalog.test.js`

RED evidence:

1. Add assertions for the literal inventory-name-to-URI mapping, bare-path distinction, exact-URI unavailability threshold, non-exhaustive project directory rule, and changed-request recovery in both workflow-visible and Skill-only Core reminder paths.
2. Add renderer assertions for the same identity rule.
3. Run only the focused tests and capture the expected failures before prompt production edits.

GREEN implementation:

1. Add one compact shared semantic block to both Core staged reminders without choosing any Skill.
2. Add the same rule to the canonical workflow index renderer.
3. Preserve reminder size limits and all existing negative assertions against gates, routing, blocking, continuation, and automatic retry.

### S2: Main and Advisor managed context

Write set:

- `plugins/omp-config/assets/AGENTS.md`
- `plugins/omp-config/assets/CLAUDE.md`
- `plugins/omp-config/assets/WATCHDOG.yml`
- `plugins/omp-config/skills/writing-skills/SKILL.md`
- `plugins/omp-config/test/workflow-context-sync.test.js`
- `plugins/omp-config/test/advisory-skills.test.js`
- `scripts/workflow-context-parity.test.js`

RED evidence:

1. Add parity assertions that Main copies a visible name to `skill://<name>` and passes that literal URI to the resource reader.
2. Assert that bare-path failures and a `.agents/skills` miss cannot establish runtime absence.
3. Assert that Advisor can only suggest a single optional exact-URI correction during its existing early window and retains no gate or retry authority.
4. Keep the existing WATCHDOG and managed-context size budgets.

GREEN implementation:

1. Add concise, matching Main guidance to `AGENTS.md` and `CLAUDE.md`.
2. Compress overlapping Advisor prose as necessary and add the exact evidence boundary to `WATCHDOG.yml`.
3. Clarify that `writing-skills` describes authoring/install destinations, not exhaustive OMP inventory.

### S3: Generation and regression evaluation

Dependency: S1 and S2 GREEN.

Exclusive generation write set:

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`

E2E observation write set, if its current explicit regression test proves insufficient:

- `scripts/e2e/workflow-events.mjs`
- `scripts/e2e-installed-workflow.test.js`
- `scripts/e2e/fixtures/deepseek-advisor-paired.json`

1. Run `npm run generate:workflows` exactly once because `render-skill.js` is canonical.
2. Confirm the intended generated workflow index changed and catalog/reference outputs did not receive unrelated semantic changes; mechanically inspect the complete generated write-set diff.
3. Run `npm run check:workflows` and the focused Core, Config, renderer, and parity tests.
4. Add an explicit evaluator regression proving a bare `read(path: "zh-writing-polish")` is a project-path miss, never a successful Skill read, and therefore cannot satisfy required-Skill evidence. First run that new assertion against any missing observation field/expectation to capture RED; add the smallest observation-only evaluator support if needed, then rerun GREEN. It must not block runtime, rewrite calls, or trigger retry.
5. Add or adapt a paired Advisor Chinese-polish fixture so `.agents/skills` absence language cannot pass as evidence of global Skill absence, and require exact successful `skill://plain-chinese-writing` and `skill://zh-writing-polish` reads before project work.
6. Run the isolated Chinese semantic-edit and paired-Advisor E2E scenarios. These tests score observed behavior only and do not add runtime authority.

## Local compatibility-link refresh

1. Record the real-directory names and filesystem types under both compatibility roots. Run the installer in explicit dry-run mode, require zero errors, and verify those real-directory conflicts are reported as skipped.
2. Invoke the current source `installPluginSkills({ dryRun: false })` once. It may replace symlinks but must preserve real directories.
3. Run a second dry-run. Expected current-name result is zero installs, with unrelated external-marketplace warnings reported separately.
4. Verify both `zh-writing-polish` links resolve to the installed `writing-helper` cache and both `SKILL.md` targets are readable.
5. Recheck the recorded real directories and prove they remain real directories rather than replacement symlinks.
6. Report retired orphan links and pre-existing external-marketplace warnings as legacy residue; do not delete or repair them in this task because refresh does not imply broad pruning.

## Review and validation

1. An independent plan reviewer checks authority boundaries, write-set isolation, RED/GREEN order, generation ownership, and symlink safety before implementation.
2. Main integrates both slices, reviews the current diff and generation output, and runs focused tests.
3. Run proportional root validation: relevant workspace tests, workflow checks, marketplace validation, packaging when prompt/assets affect packaged content, and `git diff --check`.
4. Give the bounded Main-reviewed diff plus commands/results to an independent reviewer. Fix supported findings, rerun affected checks, and use at most one fresh review pass.
5. Do not commit, push, release, or upgrade plugin versions without separate authorization.

## Historical execution evidence from 2026-07-19

- At completion, Main and Advisor guidance distinguished an exact OMP resource URI from a bare project path and treated one local Skill directory as non-exhaustive evidence.
- The observation-only E2E evaluator accepted nested Skill evidence only from a successfully loaded, PLAN-declared resource whose returned frontmatter and visible metadata explicitly identified it as a catalog or index. It preserved exact URIs and ignored ambiguous leaf names. The current evaluator additionally distinguishes direct selected `C` reads from the unlisted long-tail catalog chain.
- Focused tests were driven RED then GREEN. In this snapshot, the complete deterministic installed-workflow suite passed 96/96; root tests, marketplace validation, packaging, workflow/ECC generation checks, and `git diff --check` also passed. These counts do not claim the current tree has the same suite size or result.
- Three live worktree runs successfully used `skill://zh-writing-polish` without a bare Skill read or an unsupported Advisor absence claim. The third run also put project inspection after READY. The strict live scenario remains failed because that run omitted `plain-chinese-writing` and included workflow ID `writing.zh` in `skills-loaded`; this is separate stochastic composition behavior, not a successful strict-scenario result.
- Compatibility-link refresh replaced 621 stale links, preserved five conflicts during the installer operation and all 25 pre-existing real directories, and produced zero installer errors. Both `zh-writing-polish` compatibility links resolve to the readable `writing-helper` 0.2.14 cache. Fifteen retired broken orphan links in each root remain reported but untouched.
- No commit, push, release, version change, or marketplace-backed plugin upgrade was performed.
