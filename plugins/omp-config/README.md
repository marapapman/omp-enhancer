# OMP Config

`omp-config` packages the baseline OMP configuration assets from the source `omp-config` repository as installable plugin content.

## Contents

- `assets/CLAUDE.md` and root or agent config templates.
- `assets/WORKFLOW_CATALOG.md` is the generated catalog version 19 for explicit synchronization and human inspection. Its semantic source lives in `omp-enhancer-core/src/workflows/definitions`; do not edit this asset by hand.
- `skills/omp-enhancer-workflows/` publishes a compact selection table and one on-demand reference card per workflow. The table keeps exact IDs, full Primary conditions, literal card URIs, top-level `D` Skill URIs, and enumerated nested ECC `C` Skill URIs. It guides Main to declare its workflow/Skill plan, load selected resources, and rebase its own detailed TODO; it does not select a workflow, create a runtime gate, require delegation, activate tools, grant permission, or decide completion.
- `skills/ecc/SKILL.md` publishes one top-level `ecc-skill-catalog` adapter, and `skills/ecc/catalog.md` indexes 255 nested ECC guides for exact, on-demand reads.
- `assets/AGENTS.md` adds a compact Agent-owned staged plan/load/TODO contract and conditional handoff trace. `assets/WATCHDOG.yml` lets Advisor spend one early ordinary note coaching that contract while retaining its evidence and send limits. Neither imports `OMP_ENHANCER_WORKFLOW_CATALOG.md` nor appends the full catalog to a system prompt.
- `assets/config.yml`, `assets/models.yml`, and `assets/mcp.json` remain templates only. `models.yml` contains DeepSeek provider-compatibility overrides, not a complete supported-model inventory.
- `assets/config.yml` keeps `opencode-go/deepseek-v4-flash:max` as `modelRoles.default`, selects `openai-codex/gpt-5.6-luna:xhigh` for `modelRoles.advisor`, and includes `modelRoles.tiny` for optional lightweight tasks. MiMo v2.5 is an explicit alternative rather than an automatic default change; OMP and the acting Agent retain workflow selection.
- `agents/`, `skills/`, and notify-only `hooks/` copied from the config source. For ordinary code work, Config contributes only the read-only `plan` role; OMP's native `task` owns implementation slices and native `reviewer` remains the semantic-diff reviewer, so neither native role is shadowed. Other packaged Agents are retained only for distinct network, security, visual, or open-source boundaries.
- `skills/code-development/` is the single general code-process Skill. It covers local and decision-relevant external search, detailed parallel-wave planning, plan review, native task-owned vertical TDD, Main integration and `MAIN REVIEW`, and bounded semantic review/repair; `references/omp-enhancer.md` adds repository-specific generation, packaging, and installed-E2E guidance only when applicable.
- `hook-templates/` contains behavior-changing DeepSeek compatibility templates that are packaged but not auto-discovered.
- Slash command content for `/omp-config:config`, `/omp-config:config-doctor`, and `/omp-config:config-assets`.
- Default-inactive runtime tools for extension loading: `omp_config_doctor`, `omp_config_assets`, `omp_config_plan`, and `omp_config_sync_workflow_context`.

## Safety

This package does not automatically overwrite `~/.omp`. Treat the packaged files as templates and review any patch plan before applying changes to a live OMP home.

`omp_config_sync_workflow_context` defaults to dry-run. It manages the dedicated `OMP_ENHANCER_WORKFLOW_CATALOG.md` file and marker-delimited blocks in `AGENTS.md` and `WATCHDOG.yml`; unrelated `AGENTS.md` and Advisor content is preserved. The catalog file is synchronized for optional reference, but the managed blocks do not import it. The catalog itself also carries managed markers, and sync refuses to overwrite a same-named user-owned file without them. Set `apply: true` only after reviewing the reported target and actions. The sync rejects incomplete managed markers, unsupported non-literal Advisor instructions, and symlinked destination files rather than guessing.

The auto-discovered destructive-command and malformed edit-anchor guard hooks
are advisory-only: they produce UI warnings, do not rewrite input or output,
and never return `block: true`. Behavior-changing DeepSeek compatibility hooks
live under `hook-templates/`. They can repair model-specific context or tool
input and run a consolidated result-format/redaction/truncation pipeline only
after a user explicitly installs the chosen templates together with their
referenced `lib/` helpers. The plugin does not activate them automatically, and
they are not permission gates. The templates are scoped to provider
`opencode-go` and model IDs `deepseek-v4-flash` and `deepseek-v4-pro`.
Bundled agents do not declare `blocking: true`, and the config template disables
`loopGuard` plus compaction `autoContinue` by default. Host sandboxing, approval,
and system safety policy remain independent of this plugin.

The packaged Main and Advisor blocks explicitly defer to OMP's native system
prompt, settings, active tools, dynamic Available Agents list, approval flow,
and completion behavior. For analysis, judgment, workflow composition,
coordinated stages, or possible delegation, Main follows the soft sequence
`DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY`. Only an
exact native `skill-prompt` body named `omp-enhancer-workflows` counts as a
supplied index. If that body was not supplied, an index-only `DISCOVER` batch
reads `skill://omp-enhancer-workflows` as navigation and waits; managed context,
an Available Skills description, or another Skill body cannot replace it. A
mechanical field lookup without analysis uses no Skill, marker, or TODO. The
next response starts at byte 0 with the exact `WORKFLOW PLAN`:
Primary/Add-ons, exact domain Skill/catalog URIs only, structured
`Load order: NOW=[...] THEN=[...]`, and at least four detailed Actions for LOAD,
COMMIT, SPLIT + EXECUTE, and VERIFY. Workflow references appear only in THEN;
NOW contains non-supplied Skill/catalog URIs. Selected index `D` entries are
top-level exact URIs and selected `C` entries are enumerated nested ECC exact
URIs; both go directly into PLAN/NOW. The full `skill://ecc-skill-catalog` chain
is reserved for unlisted long-tail discovery. Main loads the declared resource
batches and waits, following only exact linked Skill URIs revealed by a loaded
source before reading Add-on references and the Primary reference last. After
all resources return, the next response starts at byte 0 with exact
`WORKFLOW READY | ...` and initializes the rebased TODO only, then ends and
waits. The loaded-card soft compiler emits an exact `Delegate` row when a
`subagent-driven` card has complete input, a safe checkpoint, and a visible
matching Agent; otherwise it records one matched permitted fallback. Parent
VERIFY rows remain separate. Native `todo` is used only when exposed and
allowed; otherwise the same checklist remains the execution state. Project
tools start in the following response. An Add-on never replaces the Primary,
and the guidance creates
no runtime route, gate, permission, dispatch, or completion decision.

Every selected non-simple workflow has a `subagent-driven` soft default when a matching Agent is exposed and can own a safe, complete, bounded checkpoint. Main prefers a domain Agent named by the selected cards, then generic native `task`; it batches runnable independent checkpoints and preserves dependency order for sequential checkpoints. Main retains the parent TODO, integration, final verification, permissions, and external effects. Mechanical work bypasses the staged workflow; `agentic.simple` stages and then stays direct; `writing.pending` waits for language and composes `writing.zh` or `writing.en` before any delegation. User-required Main-only work, unavailable Agent/capacity, incomplete assignment input, or unsafe dependencies/write overlap must be recorded as a direct-fallback limitation. This chooses no Agent or fork width and creates no gate.

For substantive code mutation, Main searches enough local code and, when relevant, current official/community evidence to write a detailed plan of dependency-ordered waves and non-overlapping vertical slices. Plugin `plan` reviews the complete plan first. Main submits all runnable independent slices in one wave through one native `task` `tasks[]` batch; each task owns test mutation, valid RED, minimal production, same-command GREEN, and refactor. Main waits, integrates and runs broader current-tree verification, then writes visible `MAIN REVIEW` before native `reviewer` receives the Main-reviewed bounded diff/evidence. Main validates findings; supported material repair returns to native `task`, followed by refreshed evidence, another Main review, and at most one fresh affected reviewer. Missing Agents/capacity or an unsafe split produces an explicit fallback limitation, not a fixed fan-out, router, gate, or automatic loop.

The Advisor block adds only low-noise assistance and evidence rules:
it does not infer Main capabilities from Advisor's narrower tool schema, defaults
to one consolidated ordinary note per primary task, closes that ordinary window
at Main's first native `task` call or substantive project action, and suppresses
late nits after a complete Main final while preserving native `blocker` delivery.
It may emit one `DECISION CHECK (optional)` tuple identifying a missing plan,
undeclared resource, Skill-plan or TODO-plan mismatch, missing Primary,
collapsed Add-on, reopened fork decision, missing delegation-or-fallback disposition for a selected subagent-driven card, or assignment-schema risk. Main may
accept, adjust, or ignore it. The Advisor cannot guess unseen IDs, choose an
Agent or fork width, or require redispatch solely for metadata. These are model-behavior instructions, not a
runtime guarantee; live workflow, Skill, TODO, and fork observations remain stochastic model samples. The blocks do not change host approval, block a tool call,
or schedule an Agent continuation.

When Main visibly treats multiple exact targets as indivisible only because it
will compare them later, they share a repository, or it prefers to retain
context, Advisor may use that same one-note budget to ask Main to reapply OMP's
native independence test. Advisor still does not choose the Agent or fork width.

The companion Core plugin has two exact-model exceptions that do not alter this
package's prompt assets. For a top-level Main task using exact
`opencode-go/deepseek-v4-flash` or exact `opencode-go/mimo-v2.5`, it may append at
most one hidden custom-hook compatibility message per active task. The labels are
model-specific, but both messages reinforce
`DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY`: index-only
discovery unless the exact native `skill-prompt` body named
`omp-enhancer-workflows` was supplied, a byte-0 `WORKFLOW PLAN` whose Skills
contain only selected `D`/`C` exact Skill URIs or a long-tail catalog URI and
whose workflow references appear only in structured THEN, four detailed
Actions, bounded NOW/THEN loading, and a byte-0 `WORKFLOW READY | ...` with delegated TODO
rows plus parent VERIFY before project work. Its stored attribution is `user`,
while OMP presents ordinary custom-hook messages as supplemental developer
context, so it explicitly yields to the user instruction and native OMP
contracts.

The message includes workflow navigation only when that Skill is visible, other
Skill discovery only when OMP exposes visible Skills, and task-shape or review
facts only when the corresponding native capability is active and allowed. After
READY, Main owns the detailed plan, native Agent choice, slice width, integration, and review decisions. The message
does not return or replace `systemPrompt`, provide or autoload a Skill, change the
native `task` schema or active tools, select a workflow, Agent, fork, reviewer
count, dispatch, permission, or completion condition. Other provider/model
tuples, subagents, and Advisor do not receive it.

Set `OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT=1` or
`OMP_ENHANCER_DISABLE_MIMO_COMPAT=1` only for controlled reminder diagnostics of
the corresponding exact model while leaving Core and the rest of OMP loaded.
The default behavior remains enabled under the capability checks above.

`/model` changes the active session model. Selecting MiMo v2.5 this way is explicit and does not rewrite the packaged DeepSeek Main default. The primary request path does not run a plugin router or inject a catalog. OMP owns the request workflow. Analytical, judgment, composition, coordination, and possible-delegation work uses `omp-enhancer-workflows` only as the first navigation index, then loads the smallest selected exact `D`/`C` domain Skill set or an unlisted long-tail catalog chain when useful; mechanical field lookup uses no Skill. Main still chooses every workflow, Agent, Skill, and execution action.

## Commands

- `/omp-config:config` explains the package contents.
- `/omp-config:config-doctor` asks the runtime tool to inspect packaged config risks.
- `/omp-config:config-assets` asks the runtime tool to list packaged content.

## Bundled Skills

The plugin ships `skills/` as plugin content, declares it through `pi.skills`,
and lists its filesystem inventory in the root marketplace catalog. OMP 17's
normal plugin discovery is deliberately shallower than that inventory: it
directly discovers only `<plugin>/skills/<child>/SKILL.md`. A nested path such
as `skills/ecc/accessibility/SKILL.md` is not registered as an independent
prompt-visible Skill.

For this reason, OMP sees `skills/ecc/SKILL.md` as the single top-level
`ecc-skill-catalog`. Its 255 nested guides stay out of the permanent system
prompt. The compact workflow index may nevertheless enumerate a relevant nested
guide as an exact `C` URI such as
`skill://ecc-skill-catalog/network-config-validation/SKILL.md`; Main copies a
selected `C` directly into PLAN/NOW without first reading the full catalog. Only
an unlisted long-tail need starts with `skill://ecc-skill-catalog`, then follows
exact URIs visibly disclosed by that loaded source. Do not bulk-load the guides or guess a
nested URI.

The marketplace `skills` array still recursively lists every directory that
contains `SKILL.md`, including nested ECC paths. That recursive inventory is
used by repository validation and the explicitly invoked
`omp_core_install_skills` compatibility installer; it is not evidence that OMP
17 directly registers all nested guides during normal plugin discovery. Treat
the filesystem and generated inventory as authoritative rather than maintaining
category subtotals by hand.

## Runtime tools

When the extension entrypoint is loaded, the plugin registers the following tools with `defaultInactive: true`:

| Tool | Purpose |
| --- | --- |
| `omp_config_doctor` | Reports hardcoded home-path portability risks in the packaged config template without modifying files. |
| `omp_config_assets` | Lists packaged agents, skills, hooks, and config templates. |
| `omp_config_plan` | Produces a manual review plan before applying templates to a target OMP home. |
| `omp_config_sync_workflow_context` | Dry-runs or explicitly applies the optional catalog asset and managed context blocks to a target OMP agent directory. |

They do not enter the default active-tool set. With `omp-enhancer-core` loaded,
activate them explicitly for the current session with
`/enhancer-tools enable config`, inspect with `/enhancer-tools status`, and
disable them again with `/enhancer-tools disable config`. Activation does not
bypass each tool's read/write approval class.

Example preview and explicit apply tool inputs:

```json
{"target":"/home/example/.omp/agent"}
```

```json
{"target":"/home/example/.omp/agent","apply":true}
```

The target defaults to `PI_CODING_AGENT_DIR` when set, otherwise `~/.omp/agent`.

## Validation

Use `npm run pack:dry` from this directory to verify the package includes the copied assets and plugin metadata. From the repository root, run `npm run generate:ecc-skills` after adding, removing, or changing nested ECC guide metadata, and use `npm run check:ecc-skills` in validation to reject stale `SKILL.md` or `catalog.md` adapter output.
