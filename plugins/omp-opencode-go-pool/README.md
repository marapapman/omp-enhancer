# OMP OpenCode Go Pool

Transparent OpenCode Go key pooling for OMP.

The plugin keeps the public provider as `opencode-go`. Users still select the same OpenCode Go models, and `/model` should not show extra providers or pool-specific model names.

## Marketplace Install

Recommended installation uses the OMP marketplace so future releases can be upgraded with `omp plugin upgrade`.

Add the root monorepo marketplace once:

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

Install and enable the plugin:

```bash
omp plugin install omp-opencode-go-pool@omp-enhancer
omp plugin enable omp-opencode-go-pool@omp-enhancer
```

Update the marketplace catalog, then upgrade the plugin:

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade omp-opencode-go-pool@omp-enhancer
```

If you are developing locally, use a local marketplace or plugin link flow instead of the GitHub marketplace upgrade path.

## Commands

- `/opencode_go_pool_key`
  Add an extra OpenCode Go API key through interactive prompts.
- `/opencode_go_pool_key remove <label|id|hash>`
  Remove an extra key from the plugin-owned vault.
- `/opencode_go_pool_key rename <label|id|hash> <new-label>`
  Rename an extra key.
- `/opencode_go_pool_status`
  Show key health, cooldowns, in-flight counts, recent errors, and plugin-observed usage for 5h, weekly, and monthly windows.

Do not paste raw API keys into slash-command arguments. Run `/opencode_go_pool_key` without key text and enter the key in the prompt.

## Configuration Model

The primary OpenCode Go key remains whatever OMP already resolves for `opencode-go`: `models.yml`, stored auth, environment, or login-backed configuration.

Extra keys are added only through `/opencode_go_pool_key`. The plugin stores them in a local plugin-owned vault under:

```text
~/.omp/agent/state/opencode-go-pool-vault.json
```

The vault is written with owner-only file permissions where the platform supports it. This is local protected storage, not a strong encryption guarantee. Status/state/usage files store only labels and key hashes, never raw key values.

## Usage Accounting

`/opencode_go_pool_status` reads the plugin-owned JSONL ledger:

```text
~/.omp/agent/state/opencode-go-pool-usage.jsonl
```

It reports plugin-observed attempts by key label/hash. It does not claim to be the OpenCode Go dashboard bill, and it does not replace OMP native `/usage`.

The slash command displays its report through OMP's extension notification UI. If the command appears to do nothing after an upgrade, start a new OMP session so the process reloads the upgraded plugin code.

## Routing

The plugin registers the same provider name, `opencode-go`, with an internal custom API id, `opencode-go-balanced`. It does not register replacement models. At session start, it copies the already-selected OpenCode Go model and changes only the runtime API field for that session, so `/model` remains backed by OMP's native OpenCode Go catalog.

Requests are balanced across the primary key and extra keys. Keys that hit rate limits, quota exhaustion, authentication failures, or transient provider errors are cooled down or disabled according to the error class.
