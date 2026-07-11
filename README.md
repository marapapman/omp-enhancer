# omp-enhancer

This repository is an OMP marketplace monorepo containing five plugins. `omp-enhancer-core` is the runtime router. The other plugins provide config assets, writing tools, testing tools, and fact-checking workflows.

## Plugins

- `omp-enhancer-core`: compiles natural-language tasks into a versioned descriptor and route plan, provides `/classifier` diagnostics, and owns bounded completion gating.
- `omp-config`: packages OMP config assets, agents, skills, hooks, templates, and safe diagnostics.
- `writing-helper`: provides writing QA tools, writer/checker agents, and writing skills.
- `omp-testing-enhancer`: provides test analysis, browser evidence, coverage, mutation, gates, and reports.
- `omp-fact-checker`: provides claim extraction, evidence collection, cross-checking, reporting, and fact-check gates.

## Workspace

This repository uses npm workspaces for plugin packages under `plugins/`:

- `plugins/omp-enhancer-core`
- `plugins/omp-config`
- `plugins/writing-helper`
- `plugins/omp-test-enhancer`
- `plugins/omp-fact-checker`

## Marketplace install

The marketplace catalog lives at `.omp-plugin/marketplace.json` and uses `metadata.pluginRoot: "plugins"`. After this repository is pushed to GitHub, OMP can use the repository itself as the marketplace.

### Option 1: install from the GitHub marketplace

Add the GitHub marketplace once:

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

Install the full enhancer stack with one command:

```bash
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer
```

This installs:

- `omp-enhancer-core`: natural-language routing, governance hooks, skill gates, per-subagent skill gates, and task gates.
- `omp-config`: config assets, agents, skills, hooks, templates, and safe diagnostics.
- `writing-helper`: writing QA tools, writer/checker agents, and writing skills.
- `omp-testing-enhancer`: test analysis, browser evidence, coverage, mutation, gates, and reports.
- `omp-fact-checker`: claim extraction, evidence collection, independent cross-checking, reports, and fact-check gates.

OpenCode Go multi-key routing and per-account `/usage` are handled by OMP's native multi-credential provider support. This marketplace no longer ships a separate OpenCode Go key-pool plugin.

### Option 2: install from a local checkout

For local testing before publishing, add the repository path as a marketplace:

```bash
omp plugin marketplace add /path/to/omp-enhancer
```

Then run the same install command:

```bash
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer
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

- Model selection follows the active OMP `modelRoles` config unless a route names an explicit role. Fact-check planning uses `pi/plan` with `pi/slow` fallback, and fact-check cross-check/review use `pi/slow`.
- Routing first builds a `TaskDescriptor` containing operation, domains, explicit constraints, ordered phases, capabilities, risk, and complexity. A `RoutePlan` then selects skills, tools, subagents, and gate requirements. Legacy intent fields remain a compatibility projection during rollout.
- The core runtime detects repeated sentence, phrase, block, and n-gram generation. Detection never sends a follow-up message itself; `GateController` owns every repair or terminal continuation.
- Ambiguous routing can use OMP Tiny, `modelRoles.tiny`, which the packaged `omp-config` template defaults to `opencode-go/deepseek-v4-flash:medium`. Do not create a separate classifier role.
- Broad coding tasks use lightweight TDD guidance, fork plan/task/reviewer subagents with role-specific skill lists, and require testing evidence. Focused changes stay with the main agent unless broader delegation is justified.
- Security review tasks fork ecc-security-reviewer plus reviewer.
- Broad writing tasks route to writer/checker or zh-writer/zh-checker subagents; simple edits stay with the main agent. Both retain the applicable writing skills and QA evidence requirements.
- Chinese writing requires `plain-chinese-writing`.
- Test authoring, coverage review, flaky-test analysis, browser verification, and bug checks are routed into the merged bug-audit workflow. Bug-audit must generate and execute a deduplicated multi-channel test matrix across boundary inputs, load, operating modes, and failure paths; static analysis alone is incomplete. `omp-enhancer-core` only declares and listens for the `omp_test_*` toolchain; `omp-testing-enhancer` owns the tool implementations, including browser, coverage, and mutation tools when the target context provides them.
- Config tasks use `omp_config_doctor`, `omp_config_assets`, and `omp_config_plan`, with librarian/reviewer subagent evidence before completion.

Slash commands remain compatibility helpers for older workflows. The new workflow does not require `/test` or `/writing-quality`. `/classifier` is intentionally limited to classifier model configuration and diagnostics.

### Classifier model configuration

The classifier is an advisory, monotonic hint source. `omp-enhancer-core` exposes:

- `omp_core_classifier_prompt`: builds the strict JSON prompt and schema for OMP Tiny, `modelRoles.tiny`.
- `omp_core_resolve_classification`: validates classifier JSON, maps it through the route whitelist, and then sets the normal routed workflow state.

Configure the model in OMP config:

```yaml
modelRoles:
  tiny: opencode-go/deepseek-v4-flash:medium
```

`/model` changes the active session model. Classifier preflight should dispatch through `modelRoles.tiny`; do not create or maintain a classifier-specific model role. Invalid or unavailable classifier output falls back to the deterministic descriptor and does not freeze normal tools or start another classifier loop.

Classifier JSON may contain only `operationHint`, `domains`, `phaseHints`, `riskFlags`, `language`, `confidence`, and `reason` (with one-version legacy compatibility). It cannot grant constraints or capabilities, invent skills/tools/subagents/gates, remove deterministic phases, relax an explicit prohibition, or reduce protected security/release risk.

Model-callable route, classifier, governance, and validator tools are pinned to the active user-turn authorization. They may inspect or refine that task, but changing a tool argument cannot create a new user turn, replenish the controller budget, grant file/network/subagent authority, or remove required evidence.

### Routing and gate rollout modes

The following environment variables are read by the core runtime:

```bash
export OMP_ROUTER_V2_MODE=observe
export OMP_GATE_RECOVERY_MODE=observe
export OMP_LOOP_GUARD_MODE=legacy
```

- `OMP_ROUTER_V2_MODE=legacy|observe|enforce`: `observe` is the default. It preserves the legacy intent unless a deterministic canonical correction applies, projects descriptor authorization/resource ceilings for protected, focused, and compound routes, and records intent plus resource disagreement and the effective resource source. `legacy` is the strict compatibility rollback; `enforce` always activates descriptor policy selection.
- `OMP_GATE_RECOVERY_MODE=legacy|observe|enforce`: `observe` is the default. `enforce` consumes RoutePlan resources directly; every mode still uses the same bounded controller and protected action boundary.
- `OMP_LOOP_GUARD_MODE=legacy|observe|enforce|disabled`: `legacy` is the default. `observe` records repetition without aborting output; `legacy` and `enforce` abort detected repetition and hand it to the controller; `disabled` bypasses detection.

Completion checks always collect final evidence first, aggregate every open gate, and make one controller decision. A route has at most two repair continuations and one terminal-only continuation. Exhausted writing/testing metadata gates become explicit `degraded` results; exhausted security, release, fact, irreversible-operation, or loop protection becomes `blocked`. Non-empty final text is still checked, and a failed tool result never counts as evidence.

Short user follow-ups such as `继续`, `开始实现`, `开始修复`, `Go ahead`, or `Proceed with the plan` inherit only an existing non-release executable route. They preserve every prior prohibition and cannot create write or release authority without context. A release-target confirmation or missing trusted host approval enters an awaiting-user terminal state immediately, so the model can ask once instead of spending the repair budget retrying an action that needs new authority.

The protected action boundary is fail-closed for explicitly offline work. Repository-controlled tests, builds, package scripts, and automation can execute arbitrary network code, so they cannot prove a no-network constraint without a host network sandbox. The core blocks those commands under an explicit offline route rather than claiming heuristic command classification is equivalent to OS isolation.

Evidence-sensitive fallback paths are tied to host-observed actions rather than final-answer assertions:

- A manual testing fallback requires a successful test command result and a structured `MANUAL_TESTING_GATE_REPORT` whose `Command` exactly matches the observed command. Masked commands, dry runs, empty test suites, failure output, and command substitutions do not close the gate.
- With Testing Enhancer available, `omp_test_gate` still requires a successful route-scoped host-observed test result. The gate never executes `testCommand` input or `.omp/testing-enhancer.yml` commands; those fields only constrain the expected command digest. Browser artifacts are confined below the real project `.omp/testing-enhancer-artifacts` directory, and inline server startup is limited to package-manager start/dev/serve/preview scripts.
- When a security route explicitly forbids subagents, the main-agent fallback requires host-observed reads of both `security-review` and `security-scan`, a successful source or scanner inspection, and a structured `SECURITY_REVIEW` report. Report text or `SKILL_USAGE` self-attestation alone is insufficient.
- A reversible connector action is not a release. Email, Slack, Jira, Google Drive, Calendar, and Notion mutations run only when the trusted prompt's provider, action, and exact role-bearing target match the tool call. A missing or conflicting target pauses for one clarification; a mismatched call gets one mechanical correction. Multi-action connector prompts must be split or sequenced explicitly, and destructive connector actions remain unsupported.
- A release gate first binds the concrete repository, registry, package/version, ref, image, namespace, and cluster values to the trusted user request. Incomplete or conflicting targets stop before mutation. Completion then requires two distinct host-observed steps: a real successful external mutation followed by a compatible read-only verification such as `git ls-remote`, an exact npm dist-tag observation, or the applicable deployment/status query. Echoed commands, dry runs, masked failures, target substitutions, and mutation output without later verification remain gated.

When both core and `omp-testing-enhancer` share a live runtime owner marker, core is the only `session_stop` continuation owner. Testing Enhancer publishes versioned, route-scoped evidence. A historical persisted marker is diagnostic only and cannot make Testing Enhancer surrender ownership. Without a live core owner, Testing Enhancer retains its own bounded standalone gate.

For irreversible file operations, core observes the host's `tool_approval_requested` and `tool_approval_resolved` events and accepts only a matching approved chain bound to the live session, route, tool call, and tool name. The authorized call is consumed once; its input is bound at execution time, and the irreversible completion gate closes only after a successful matching tool result. Route text, model output, tool arguments, restored session data, resolved-only events, and replayed or cross-route approvals cannot self-grant destructive authority. Some host yolo/automatic-approval paths may emit no approval event; in that case destructive actions deliberately fail closed. Do not retry the blocked command: rerun it with interactive write approval enabled so the host can emit the bound approval events.

### Main-agent loop guard

The packaged config contains host-side detector tuning only:

```yaml
loopGuard:
  enabled: true
  mainAgent:
    modelPattern: deepseek-v4-flash
    maxRepeatedSentence: 3
    maxRepeatedPhrase: 2
```

Core recovery count and ownership are not configured by this YAML block. They are fixed by `GateController` and the rollout variables above. The core detector ignores fenced code blocks, SKILL_USAGE/SUBAGENT_USAGE evidence blocks, and markdown tables so normal outputs are not treated as loops.

Set `OMP_DEBUG_GATES=1` to write structured route, gate, and loop JSONL diagnostics under `.omp/logs`. Prompts are hashed by default. Raw prompt logging is available only with the explicitly unsafe `OMP_DEBUG_GATES_UNSAFE_PROMPTS=1` switch.

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
omp plugin upgrade omp-fact-checker@omp-enhancer
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
omp plugin marketplace update omp-enhancer
omp plugin upgrade
```

## Validation

Check the marketplace catalog with:

```bash
npm run check:marketplace
```
