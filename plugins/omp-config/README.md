# OMP Config

`omp-config` packages the baseline OMP configuration assets from the source `omp-config` repository as installable plugin content.

## Contents

- `assets/CLAUDE.md` and root or agent config templates.
- `assets/WORKFLOW_CATALOG.md` is the generated catalog version 12 for explicit synchronization and human inspection. Its semantic source lives in `omp-enhancer-core/src/workflows/definitions`; do not edit this asset by hand.
- `skills/omp-enhancer-workflows/` publishes the same catalog as an optional OMP Skill with domain-specific references. It does not select a workflow, require TODOs or delegation, activate tools, grant permission, or decide completion.
- `skills/ecc/SKILL.md` publishes one top-level `ecc-skill-catalog` adapter, and `skills/ecc/catalog.md` indexes 255 nested ECC guides for exact, on-demand reads.
- `assets/AGENTS.md` and `assets/WATCHDOG.yml` contain small native-authority notices. They refer to the optional Skill but do not import `OMP_ENHANCER_WORKFLOW_CATALOG.md` or append the full catalog to a system prompt.
- `assets/config.yml`, `assets/models.yml`, and `assets/mcp.json` remain templates only.
- `assets/config.yml` includes `modelRoles.tiny` for optional lightweight tasks; OMP and the acting Agent retain workflow selection.
- `agents/`, `skills/`, and notify-only `hooks/` copied from the config source. `omp-config` contributes the uniquely named `omp-target-auditor`; OMP's native `designer`, `librarian`, and `reviewer` remain authoritative and are not shadowed.
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
and completion behavior. They do not require the optional workflow Skill,
change host approval, block a tool call, or schedule an Agent continuation.

The companion Core plugin has one model-specific exception that does not alter
this package's prompt assets. For an exact `opencode-go/deepseek-v4-flash`
top-level Main task, it may append at most one hidden custom-hook compatibility
message. Its stored attribution is `user`, while OMP presents ordinary custom
hook messages to the model as supplemental developer context, so the message
explicitly yields to the user instruction and native OMP contracts. It includes Skill discovery only when OMP
exposes visible Skills, and then includes a concise
`DEEPSEEK_DELEGATION_HINT` only when OMP's native `task` tool is active and the
user has not forbidden agents or delegation. The hint reinforces OMP's own delegation
decision, keeps direct work inline, prescribes no fixed fan-out or alternate
task shape, and uses OMP's existing SHOULD-level preference only as a tie-breaker
between routes that remain valid after the native direct/mechanical, dependency,
prerequisite, and already-enumerated rules. It does not create a new gate or MUST.
The hint only restates the current native width when one canonical OMP
Delegation section confirms batch `tasks[]` plus numeric capacity $N \geq 2$:
2 through $N$ independent runnable slices receive one assignment each in the
native batch. Flat, ambiguous, unknown, non-numeric-unlimited, and cap-one
configurations receive no such fact; widths above $N$ remain native decisions.
The message is omitted when neither section
applies, and is never emitted for
other models, subagents, or Advisor. It does not return or replace
`systemPrompt`, provide or autoload a Skill, change the native `task` schema or
active tools, select an Agent, grant permission, or decide completion. OMP's
native instructions, result-delivery behavior, and dynamic Available Agents
remain authoritative.

Set `OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT=1` only for controlled A/B
diagnostics that need to suppress this message while leaving Core and the rest
of OMP loaded. The default behavior remains enabled under the gates above.

The optional diagnostic classifier does not select the active workflow. If invoked explicitly, it may reuse OMP Tiny:

```yaml
modelRoles:
  tiny: opencode-go/deepseek-v4-flash:medium
```

`/model` changes the active session model. The primary request path does not run classifier preflight or inject a catalog. OMP owns the request workflow; an acting Agent may load `omp-enhancer-workflows` when its reference cards are useful.

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
prompt. First inspect OMP's directly visible Skill descriptions. Only when none
adequately matches, read `skill://ecc-skill-catalog/catalog.md`, then read the
smallest exact URI listed there, such as
`skill://ecc-skill-catalog/accessibility/SKILL.md`. Do not bulk-load the guides
or guess a nested URI.

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
| `omp_config_doctor` | Reports basic package and safe-application checks without modifying files. |
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
