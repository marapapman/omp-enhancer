# Task 5 Report

Status: complete

Commit: 8ef31ed feat: add omp config diagnostics

RED evidence:
- `npm test -w plugins/omp-config -- config-diagnostics.test.js` failed before implementation with `ERR_MODULE_NOT_FOUND` for `plugins/omp-config/src/path-policy.js`, proving the new diagnostics tests exercised missing Task 5 behavior.

GREEN evidence:
- `npm test -w plugins/omp-config -- config-diagnostics.test.js` passed with 6 tests, 0 failures.
- `npm test -w plugins/omp-config` passed with 6 tests, 0 failures.

Implemented:
- `findPathRisks(text, path)` detects hardcoded `/root/.omp` and `/root/.claude` home paths and reports safe non-autofix findings.
- `listAssets(root)` lists packaged agents and skills from the plugin root, ignoring dotfiles.
- `runConfigDoctor(root)` reads packaged `assets/config.yml` and returns path-policy findings.
- Doctor and plan reports format text output.
- `index.js` registers `omp_config_doctor`, `omp_config_assets`, and `omp_config_plan` with safe optional-root handling.

Concerns:
- Existing untracked files from other tasks remain in the worktree and were not included in the Task 5 commit.

## Task 5 review fix

Status: complete

RED evidence:
- `npm test -w plugins/omp-config` failed before implementation with `resolvePluginRoot` returning the workspace root when that root had top-level `agents`, `skills`, and `assets/config.yml`.
- The same RED run failed with `runConfigPlan` formatting `Review packaged templates under <workspace>/assets.` instead of the nested packaged plugin assets path.

GREEN evidence:
- `node --test plugins/omp-config/test/config-diagnostics.test.js` passed with 8 tests, 0 failures.
- `npm test -w plugins/omp-config` passed with 8 tests, 0 failures.

Implemented:
- `resolvePluginRoot(root)` now treats a directory as the packaged omp-config root only when it has `assets/config.yml` and `package.json` with `name: "omp-config"`.
- Workspace roots with top-level OMP-like `agents`, `skills`, or `assets` now fall back to `plugins/omp-config`.
- `runConfigPlan` now resolves the plugin root with the same resolver used by doctor and assets before formatting the packaged templates path.
- Tests cover workspace-root fallback and `omp_config_plan` asset-path resolution without writing to `~/.omp`.

Concerns:
- Existing untracked files from other tasks remain in the worktree and were not included in this fix commit.
