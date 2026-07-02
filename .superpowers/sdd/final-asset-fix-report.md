# Final asset inventory fix report

## Summary

Fixed `plugins/omp-config/src/asset-index.js` so `listAssets()` inventories every asset category promised by the config assets command:

- `agents`
- `skills`
- `hooks.pre`
- `hooks.post`
- `templates`

The implementation is read-only. It only resolves the packaged plugin root and reads directory entries with the existing hidden-file filtering and sorting behavior.

## TDD evidence

1. Added failing coverage in `plugins/omp-config/test/config-diagnostics.test.js` requiring `listAssets()` to return hook files from `hooks/pre` and `hooks/post`, and template files from `assets`.
2. Ran `npm test -w plugins/omp-config` and confirmed the new expectations failed because `hooks` and `templates` were missing.
3. Implemented the minimal asset-index change to read `hooks/pre`, `hooks/post`, and `assets` alongside the existing agents and skills directories.
4. Updated the registered asset tool description to match the expanded inventory.

## Verification

`npm test -w plugins/omp-config` passes:

- 9 tests
- 9 pass
- 0 fail
