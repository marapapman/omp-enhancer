# Task 2 Report: Move writing-helper into the monorepo

## Summary

Moved the source clone from `/home/dingli/omp-enhancer/omp-writing-helper` into `plugins/writing-helper` inside the monorepo worktree.

## Changes made

- Created `plugins/writing-helper` and copied the writing-helper plugin source content into it.
- Archived the standalone child marketplace catalog from the active plugin path:
  - from `plugins/writing-helper/.omp-plugin/marketplace.json`
  - to `plugins/writing-helper/docs/previous-marketplace.json`
- Removed the now-empty active `plugins/writing-helper/.omp-plugin` directory.
- Verified and preserved `plugins/writing-helper/package.json` package identity:
  - `name`: `writing-helper`
  - `version`: `0.2.1`
  - `type`: `module`
  - `main`: `index.js`
  - `omp.extensions`: `["./index.js"]`
- Removed `.omp-plugin` from the package `files` list so package metadata no longer advertises an active child marketplace catalog.
- Updated marketplace-related tests and README install/upgrade commands to use the root `omp-enhancer` marketplace as authoritative.
- Preserved writing-helper runtime entrypoints and tool behavior.

## Verification

Command run from `/home/dingli/omp-enhancer/.worktrees/omp-enhancer-monorepo`:

```bash
npm test -w plugins/writing-helper
```

Observed result:

```text
# tests 82
# pass 82
# fail 0
```

Full observed test summary:

```text
ℹ tests 82
ℹ suites 11
ℹ pass 82
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

## Notes

The first test run failed because the copied standalone tests still expected `plugins/writing-helper/.omp-plugin/marketplace.json`. The migration brief requires that file to be removed from active plugin content, so the tests were updated to assert the root `../../.omp-plugin/marketplace.json` catalog and the archived `docs/previous-marketplace.json` instead.

## Task 2 review finding fix

### Summary

Fixed the release sync path that still assumed an active child `plugins/writing-helper/.omp-plugin/marketplace.json`. The sync now starts in `plugins/writing-helper`, walks upward to the authoritative monorepo `.omp-plugin/marketplace.json`, and updates only the `writing-helper` plugin entry release metadata.

### Changes made

- Added a failing marketplace release test that runs from a temp `plugins/writing-helper` workspace with only a root monorepo `.omp-plugin/marketplace.json`.
- Updated `syncMarketplaceRelease()` to locate the nearest ancestor `.omp-plugin/marketplace.json` instead of reading a child catalog from the plugin workspace.
- Preserved the root-relative marketplace source string `./writing-helper`.
- Updated root catalog release metadata for `writing-helper` to include `ref: "v0.2.1"` while leaving the root-relative `source` string intact.
- Kept compatibility with object-style legacy `source.ref` catalog entries used by the archived standalone catalog tests.
- Updated the sync script output to report the actual catalog path it changed.
- Confirmed no active child `plugins/writing-helper/.omp-plugin/marketplace.json` exists.

### TDD evidence

- Red test before implementation:
  - Command: `node --test test/marketplace.test.js`
  - Expected failure observed: `ENOENT` for `/tmp/.../plugins/writing-helper/.omp-plugin/marketplace.json`
- Focused green test after implementation:
  - Command: `node --test test/marketplace.test.js`
  - Result: 8 tests passed, 0 failed.
- Required workspace test:
  - Command: `npm test -w plugins/writing-helper`
  - Result: 82 tests passed, 0 failed.

### Commit

Pending at report append time; final commit is recorded in the task completion status.
