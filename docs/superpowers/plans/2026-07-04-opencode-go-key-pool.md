# OpenCode Go Key Pool Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:tdd or superpowers:executing-plans. Implement each task with tests first where production behavior changes.

**Goal:** Add `omp-opencode-go-pool`, a transparent OMP plugin that keeps the public provider as `opencode-go`, keeps `/model` display unchanged, routes OpenCode Go model requests across the main API key plus extra keys, avoids limited keys, lets users add extra keys through `opencode_go_pool_key`, and exposes status plus plugin-owned per-key usage through `opencode_go_pool_status`.

**Architecture:** Register the same provider name `opencode-go` with a custom runtime API id `opencode-go-balanced`, but do not register a replacement model list. A `before_agent_start` hook copies the already-selected OMP OpenCode Go model and changes only its runtime `api`, so `/model` remains backed by OMP's native catalog while requests stream through the plugin. The plugin owns key selection, retry safety, cooldown state, a command-managed KeyVault, an append-only usage ledger, and two user commands: key management and status. OMP source code is not modified; native `/usage` remains separate from plugin-owned key pool usage.

**Tech Stack:** Node ESM plugin package, node:test, existing npm workspace and marketplace scripts.

## Global Constraints

- Do not create `opencode-go-1`, `opencode-go-2`, or any user-visible duplicate provider.
- Do not require users to change model names.
- Do not change `/model` display text, provider display name, ordering, or visible model metadata for OpenCode Go.
- Do not store or print raw API keys.
- Do not retry a request after visible assistant output has started.
- Do not claim upstream OpenCode Go dashboard totals; `opencode_go_pool_status` usage is plugin-observed usage.
- Do not modify OMP source code or require a native `/usage` extension point.
- Do not add usage, doctor, refresh, or duplicate helper slash commands; only expose `opencode_go_pool_key` and `opencode_go_pool_status`.
- Keep plugin behavior transparent when only the primary key exists.
- Fail open for model listing: do not register replacement model lists, so OMP's existing OpenCode Go models remain visible even if the plugin hook does not run.

---

## File Structure

Create these files.

```text
plugins/omp-opencode-go-pool/package.json
plugins/omp-opencode-go-pool/README.md
plugins/omp-opencode-go-pool/index.js
plugins/omp-opencode-go-pool/src/config.js
plugins/omp-opencode-go-pool/src/key-command.js
plugins/omp-opencode-go-pool/src/key-vault.js
plugins/omp-opencode-go-pool/src/key-pool.js
plugins/omp-opencode-go-pool/src/errors.js
plugins/omp-opencode-go-pool/src/balanced-stream.js
plugins/omp-opencode-go-pool/src/usage.js
plugins/omp-opencode-go-pool/src/provider-registration.js
plugins/omp-opencode-go-pool/src/diagnostics.js
plugins/omp-opencode-go-pool/test/config.test.js
plugins/omp-opencode-go-pool/test/key-command.test.js
plugins/omp-opencode-go-pool/test/key-vault.test.js
plugins/omp-opencode-go-pool/test/key-pool.test.js
plugins/omp-opencode-go-pool/test/errors.test.js
plugins/omp-opencode-go-pool/test/balanced-stream.test.js
plugins/omp-opencode-go-pool/test/usage.test.js
plugins/omp-opencode-go-pool/test/provider-registration.test.js
plugins/omp-opencode-go-pool/test/diagnostics.test.js
```

Modify these files.

```text
package.json
.omp-plugin/marketplace.json
scripts/check-marketplace.js
scripts/pack-all.js
README.md
```

Do not modify OMP runtime files for usage attribution. The plugin maintains its own usage ledger.

---

### Task 1: Add workspace and marketplace shell

**Files:**
- Modify: `package.json`
- Modify: `.omp-plugin/marketplace.json`
- Modify: `scripts/check-marketplace.js`
- Modify: `scripts/pack-all.js`
- Create: `plugins/omp-opencode-go-pool/package.json`
- Create: `plugins/omp-opencode-go-pool/index.js`

**Interfaces:**
- New package name: `omp-opencode-go-pool`.
- Default export: `registerOpenCodeGoPool(pi)`.
- OMP extension entry: `./index.js`.

- [ ] Step 1: Update marketplace checker to expect `omp-opencode-go-pool`, then run it and confirm it fails because the plugin is missing.
- [ ] Step 2: Add the package skeleton and root workspace entry.
- [ ] Step 3: Add marketplace metadata with source `./omp-opencode-go-pool`.
- [ ] Step 4: Ensure pack script includes the new workspace dynamically or explicitly.
- [ ] Step 5: Add a smoke test that imports the plugin and registers a fake label.
- [ ] Step 6: Run `node scripts/check-marketplace.js` and the new package test.

---

### Task 2: Key command and KeyVault

**Files:**
- Create: `plugins/omp-opencode-go-pool/src/config.js`
- Create: `plugins/omp-opencode-go-pool/src/key-command.js`
- Create: `plugins/omp-opencode-go-pool/src/key-vault.js`
- Test: `plugins/omp-opencode-go-pool/test/config.test.js`
- Test: `plugins/omp-opencode-go-pool/test/key-command.test.js`
- Test: `plugins/omp-opencode-go-pool/test/key-vault.test.js`

**Interfaces:**
- `createKeyVault({ storage, crypto, now })`
- `buildKeyCommand({ keyVault, ui, logger })`
- `parseKeyCommandArgs(args)`
- `redactKey(secret)`
- `hashKey(secret)`

- [ ] Step 1: Write tests that `opencode_go_pool_key` with no args asks for label and API key through UI input.
- [ ] Step 2: Write tests that inline values matching API-key patterns are rejected and never persisted.
- [ ] Step 3: Write tests for add, remove, rename, duplicate hash, blank label, and blank key flows.
- [ ] Step 4: Implement `KeyVault` with a storage adapter; prefer OMP/plugin secret storage or secret plugin setting when available, otherwise a plugin-owned encrypted local vault.
- [ ] Step 5: Ensure persisted metadata stores label, hash, source, createdAt, and disabled state, while raw key only lives in the secret backend.
- [ ] Step 6: Register `opencode_go_pool_key`; do not register config-file or env-var setup commands.
- [ ] Step 7: Run key command and vault tests.

---

### Task 3: Key pool state and selection

**Files:**
- Create: `plugins/omp-opencode-go-pool/src/key-pool.js`
- Test: `plugins/omp-opencode-go-pool/test/key-pool.test.js`

**Interfaces:**
- `createKeyPool(options)`
- `keyPool.refresh({ primaryApiKey, extraKeysFromVault })`
- `keyPool.select({ model, now })`
- `keyPool.markSuccess(slotId, result)`
- `keyPool.markFailure(slotId, errorInfo)`
- `keyPool.snapshot()`

- [ ] Step 1: Test that primary key and extra keys are deduped by hash.
- [ ] Step 2: Test that cooled-down keys are not selected.
- [ ] Step 3: Test that disabled auth-error keys are not selected.
- [ ] Step 4: Test that high `inFlight` pushes selection toward another healthy key.
- [ ] Step 5: Test that all-exhausted returns a structured pool exhaustion result.
- [ ] Step 6: Implement `power-of-two choices` scoring.
- [ ] Step 7: Add state serialization without raw key material.
- [ ] Step 8: Run key pool tests.

---

### Task 4: Error classification and cooldown policy

**Files:**
- Create: `plugins/omp-opencode-go-pool/src/errors.js`
- Test: `plugins/omp-opencode-go-pool/test/errors.test.js`

**Interfaces:**
- `classifyProviderError(error)`
- `deriveCooldown(errorInfo, config, now)`
- `isRetryableBeforeVisibleOutput(errorInfo)`

- [ ] Step 1: Test HTTP 429, quota text, rate-limit text, and `all accounts exhausted`.
- [ ] Step 2: Test `Retry-After` seconds and HTTP date parsing.
- [ ] Step 3: Test HTTP 401 and 403 as auth errors.
- [ ] Step 4: Test HTTP 5xx and network timeout as short cooldown errors.
- [ ] Step 5: Implement classifiers using status, code, headers, and message text.
- [ ] Step 6: Run error tests.

---

### Task 5: Provider registration and model overlay

**Files:**
- Create: `plugins/omp-opencode-go-pool/src/provider-registration.js`
- Test: `plugins/omp-opencode-go-pool/test/provider-registration.test.js`

**Interfaces:**
- `registerOpenCodeGoPoolProvider(pi, dependencies)`
- `buildBalancedModelOverlay(model)`

- [ ] Step 1: Write fake `pi.registerProvider` tests.
- [ ] Step 2: Assert provider name is exactly `opencode-go`.
- [ ] Step 3: Assert registered API id is `opencode-go-balanced`.
- [ ] Step 4: Assert provider registration does not provide `models` or `fetchDynamicModels`.
- [ ] Step 5: Assert the `before_agent_start` runtime overlay keeps provider `opencode-go`.
- [ ] Step 6: Assert the runtime overlay preserves original model `id`, `name`, display metadata, sorting metadata, and provider display behavior while setting api `opencode-go-balanced`.
- [ ] Step 7: Add a snapshot-style test proving `/model`-visible OpenCode Go text does not include `opencode-go-balanced`, pool, usage, cooldown, or extra key labels.
- [ ] Step 8: Implement runtime overlay from the already-selected model instead of duplicating OpenCode Go catalog metadata.
- [ ] Step 9: Verify `omp models opencode` output remains unchanged with the plugin loaded.
- [ ] Step 10: Run provider registration tests.

---

### Task 6: Balanced stream handler

**Files:**
- Create: `plugins/omp-opencode-go-pool/src/balanced-stream.js`
- Test: `plugins/omp-opencode-go-pool/test/balanced-stream.test.js`

**Interfaces:**
- `createBalancedStream({ keyPool, openAICompletionsStream, now })`

- [ ] Step 1: Test single primary key delegates to OpenAI-compatible stream unchanged except selected api key.
- [ ] Step 2: Test first key 429 before visible output, second key succeeds.
- [ ] Step 3: Test first key emits visible output then errors, and the plugin does not replay on second key.
- [ ] Step 4: Test all keys exhausted returns a clear redacted error.
- [ ] Step 5: Test successful final usage is recorded to the selected key in the plugin usage ledger.
- [ ] Step 6: Implement selected-key forwarding by cloning model with built-in OpenAI-compatible API.
- [ ] Step 7: Buffer only enough early events to know whether output has become visible.
- [ ] Step 8: Run stream tests.

---

### Task 7: Plugin-owned usage ledger and reporting

**Files:**
- Create: `plugins/omp-opencode-go-pool/src/usage.js`
- Test: `plugins/omp-opencode-go-pool/test/usage.test.js`
- Modify: `plugins/omp-opencode-go-pool/src/balanced-stream.js`

**Interfaces:**
- `createUsageLedger({ path, fs, now })`
- `usageLedger.recordAttempt(entry)`
- `usageLedger.aggregate({ window, includeFailures })`
- `formatPoolUsage(report, options)`
- Status output consumed by `opencode_go_pool_status`

- [ ] Step 1: Write failing tests for append-only JSONL usage records with no raw key material.
- [ ] Step 2: Test successful attempts aggregate cost to the selected key for 5h, weekly, and monthly windows.
- [ ] Step 3: Test failed attempts increment failure counts but do not inflate successful cost.
- [ ] Step 4: Test missing `usage.cost.total` records token counts with `costUsd: null`.
- [ ] Step 5: Test `formatPoolUsage` prints total, per-key rows, request counts, failures, in-flight, and cooldown.
- [ ] Step 6: Wire `balanced-stream` to record every attempted key selection and final outcome.
- [ ] Step 7: Expose usage only through `opencode_go_pool_status`; do not register `opencode_go_pool_usage`.
- [ ] Step 8: Run usage tests.

---

### Task 8: Diagnostics

**Files:**
- Create: `plugins/omp-opencode-go-pool/src/diagnostics.js`
- Test: `plugins/omp-opencode-go-pool/test/diagnostics.test.js`
- Modify: `plugins/omp-opencode-go-pool/index.js`

**Interfaces:**
- User command: `opencode_go_pool_key`
- Tool: `opencode_go_pool_status`
- User command: `opencode_go_pool_status`

- [ ] Step 1: Test status output includes key labels, health, in-flight count, cooldown, recent error kind, ledger writability, and usage totals.
- [ ] Step 2: Test status output never includes raw key values.
- [ ] Step 3: Test status output reports provider registration and balanced model overlay health without changing `/model` visible text.
- [ ] Step 4: Test key command output never echoes the submitted API key.
- [ ] Step 5: Register only `opencode_go_pool_key` and `opencode_go_pool_status` in the plugin entry.
- [ ] Step 6: Run diagnostics tests.

---

### Task 9: Documentation

**Files:**
- Create: `plugins/omp-opencode-go-pool/README.md`
- Modify: root `README.md`

- [ ] Step 1: Document the transparent model behavior.
- [ ] Step 2: Document extra key configuration sources.
- [ ] Step 3: Document that no duplicate provider should be configured.
- [ ] Step 4: Document that `/model` OpenCode Go display is intentionally unchanged.
- [ ] Step 5: Document `opencode_go_pool_key` as the only key entry path and warn users not to paste keys inline.
- [ ] Step 6: Document `opencode_go_pool_status` as plugin-observed status and usage.
- [ ] Step 7: Document native `/usage` as separate OMP behavior.
- [ ] Step 8: Document troubleshooting for exhausted, disabled, and cooled-down keys.
- [ ] Step 9: Include examples that do not expose real secrets.

---

### Task 10: Verification and release checks

**Files:**
- All new plugin files.
- Root scripts.

- [ ] Step 1: Run `npm test -w plugins/omp-opencode-go-pool`.
- [ ] Step 2: Run root `npm test`.
- [ ] Step 3: Run `node scripts/check-marketplace.js`.
- [ ] Step 4: Run `npm run pack:all`.
- [ ] Step 5: Install the packed plugin in a local OMP profile and run `opencode_go_pool_key` to add a low-risk extra key.
- [ ] Step 6: Run `opencode_go_pool_status`.
- [ ] Step 7: Use fake or low-risk OpenCode Go keys to verify one-key success, two-key distribution, 429 avoidance, and all-keys-exhausted output.
- [ ] Step 8: Run `opencode_go_pool_status` after successful and failed requests and verify per-key usage matches selected keys.
- [ ] Step 9: Open `/model` or equivalent model list and verify OpenCode Go display text is unchanged.

## Acceptance Criteria

- `opencode-go/<model>` requests continue to work without user-visible provider changes.
- `/model` OpenCode Go display content remains unchanged.
- The plugin can route across the primary key plus extra keys.
- A limited key is cooled down and avoided.
- Safe retry switches key only before visible assistant output.
- `opencode_go_pool_key` adds extra keys without requiring user-edited files and refuses inline secrets.
- `opencode_go_pool_status` shows key pool totals plus per-key observed usage without OMP source changes.
- No other user commands are exposed for usage, doctor, or refresh.
- Diagnostics explain key state without leaking secrets.
- Marketplace and pack checks include the new plugin.
