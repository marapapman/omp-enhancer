# omp-enhancer

This repository is an OMP marketplace monorepo containing four plugins. `omp-enhancer-core` is the runtime router. The other plugins provide config assets, writing tools, and testing tools.

## Plugins

- `omp-enhancer-core`: routes natural-language coding, writing, testing, security, and config tasks, provides `/classifier` for classifier model configuration, then gates skill and subagent evidence.
- `omp-config`: packages OMP config assets, agents, skills, hooks, templates, and safe diagnostics.
- `writing-helper`: provides writing QA tools, writer/checker agents, and writing skills.
- `omp-testing-enhancer`: provides test analysis, browser evidence, coverage, mutation, gates, and reports.

## Workspace

This repository uses npm workspaces for plugin packages under `plugins/`:

- `plugins/omp-enhancer-core`
- `plugins/omp-config`
- `plugins/writing-helper`
- `plugins/omp-test-enhancer`

## Marketplace install

The marketplace catalog lives at `.omp-plugin/marketplace.json` and uses `metadata.pluginRoot: "plugins"`. After this repository is pushed to GitHub, OMP can use the repository itself as the marketplace.

### Option 1: install from the GitHub marketplace

Add the GitHub marketplace once:

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

Install the full enhancer stack with one command:

```bash
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

This installs:

- `omp-enhancer-core`: natural-language routing, governance hooks, skill gates, per-subagent skill gates, and task gates.
- `omp-config`: config assets, agents, skills, hooks, templates, and safe diagnostics.
- `writing-helper`: writing QA tools, writer/checker agents, and writing skills.
- `omp-testing-enhancer`: test analysis, browser evidence, coverage, mutation, gates, and reports.

OpenCode Go multi-key routing and per-account `/usage` are handled by OMP's native multi-credential provider support. This marketplace no longer ships a separate OpenCode Go key-pool plugin.

### Option 2: install from a local checkout

For local testing before publishing, add the repository path as a marketplace:

```bash
omp plugin marketplace add /path/to/omp-enhancer
```

Then run the same install command:

```bash
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

### Install selected plugins

If you only need part of the stack, install a subset:

```bash
omp plugin install omp-enhancer-core@omp-enhancer writing-helper@omp-enhancer
omp plugin install omp-enhancer-core@omp-enhancer omp-testing-enhancer@omp-enhancer
```

`omp-enhancer-core` is recommended whenever you want automatic natural-language routing. Without it, the other plugins still expose their tools and compatibility commands, but the core runtime gates are not active.

## Automatic routing

After installing `omp-enhancer-core`, describe the task naturally. The core plugin injects routing guidance and completion gates through runtime hooks.

- The default runtime model is MiMo v2.5, the advisor is DeepSeek V4 Flash, and task subagents plus all other roles follow the user's active OMP config.
- The core runtime includes a main-agent loop guard for MiMo v2.5: repeated sentence or phrase generation is stopped when the host exposes assistant output events, with a one-shot recovery context as a fallback at `session_stop`.
- Ambiguous routing can use `modelRoles.classifier`, which the packaged `omp-config` template defaults to `opencode-go/deepseek-v4-flash:medium`. Use `/classifier set <provider/model:effort>` or change that config role to try another classifier model.
- Coding tasks use lightweight TDD guidance, fork plan/task/reviewer subagents, pass role-specific skill lists to each subagent, and require testing evidence.
- Security review tasks fork ecc-security-reviewer plus reviewer.
- Writing tasks route to writer/checker or zh-writer/zh-checker subagents, require writing skills, and require writing QA evidence.
- Chinese writing requires `plain-chinese-writing`.
- Test authoring, coverage review, flaky-test analysis, browser verification, and bug checks are routed into the merged bug-audit workflow. Bug-audit must generate and execute a deduplicated multi-channel test matrix across boundary inputs, load, operating modes, and failure paths; static analysis alone is incomplete. `omp-enhancer-core` only declares and listens for the `omp_test_*` toolchain; `omp-testing-enhancer` owns the tool implementations, including browser, coverage, and mutation tools when the target context provides them.
- Config tasks use `omp_config_doctor`, `omp_config_assets`, and `omp_config_plan`, with librarian/reviewer subagent evidence before completion.

Slash commands remain compatibility helpers for older workflows. The new workflow does not require `/test` or `/writing-quality`. `/classifier` is intentionally limited to classifier model configuration and diagnostics.

### Classifier model configuration

The first classifier iteration is intentionally schema-first. `omp-enhancer-core` exposes:

- `omp_core_classifier_prompt`: builds the strict JSON prompt and schema for the model configured as `modelRoles.classifier`.
- `omp_core_resolve_classification`: validates classifier JSON, maps it through the route whitelist, and then sets the normal routed workflow state.

Configure the model in OMP config:

```yaml
modelRoles:
  classifier: opencode-go/deepseek-v4-flash:medium
modelTags:
  classifier:
    name: Classifier
    color: accent
```

Or use the slash command:

```text
/classifier
/classifier set opencode-go/deepseek-v4-flash:medium
```

`/model` changes the active session model. `modelRoles.classifier` controls the classifier role used by OMP Enhancer routing; `modelTags.classifier` gives that custom role a visible name in OMP builds that list configured roles.

The classifier may choose only an intent and risk flags. It cannot invent skills, tools, subagents, or gate formats; those still come from the core route catalog.

### Main-agent loop guard

The packaged config enables a bounded repetition guard for the MiMo default model:

```yaml
loopGuard:
  enabled: true
  mainAgent:
    modelPattern: xiaomi/mimo-v2.5
    maxRepeatedSentence: 3
    maxRepeatedPhrase: 2
    maxRecoveryAttempts: 1
    fallbackRole: advisor
```

The guard ignores fenced code blocks, SKILL_USAGE/SUBAGENT_USAGE evidence blocks, and markdown tables so normal outputs are not treated as loops.

Upgrade all installed marketplace plugins with the validated command:

```bash
omp plugin upgrade
```

For targeted control, upgrade each plugin individually:

```bash
omp plugin upgrade omp-enhancer-core@omp-enhancer
omp plugin upgrade omp-config@omp-enhancer
omp plugin upgrade writing-helper@omp-enhancer
omp plugin upgrade omp-testing-enhancer@omp-enhancer
```

## Release workflow

The active marketplace catalog tracks GitHub `main`. Plugin entries in `.omp-plugin/marketplace.json` do not use `ref` by default. This lets `omp plugin upgrade` fetch the newest catalog and install newer plugin versions after you push a release commit.

Release one plugin by setting an explicit version:

```bash
npm run release -- --plugin writing-helper --version 0.3.0 --apply
```

Release every plugin with a semantic bump:

```bash
npm run release -- --plugin all --bump patch --apply
```

Preview a release without changing files:

```bash
npm run release -- --plugin omp-enhancer-core --bump minor --dry-run
```

The default release mode is `track-main`. It updates the selected plugin package version, updates the marketplace catalog version, and removes any plugin `ref` field so marketplace upgrades follow the latest pushed catalog.

Use `--pin-ref` only when you intentionally want an immutable archival release:

```bash
npm run release -- --plugin writing-helper --version 0.3.0 --pin-ref --apply
```

For normal marketplace upgrades, do not use `--pin-ref`.

Suggested release steps:

```bash
npm run release -- --plugin all --bump patch --apply
npm test
npm run check:marketplace
npm run pack:all
git add package.json package-lock.json .omp-plugin/marketplace.json plugins/*/package.json README.md scripts/release.js scripts/release.test.js scripts/check-marketplace.js
git commit -m "chore: release plugins"
git push origin main
```

After the push, users can upgrade with:

```bash
omp plugin upgrade
```

## Validation

Check the marketplace catalog with:

```bash
npm run check:marketplace
```
