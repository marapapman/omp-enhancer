# OMP Config

`omp-config` packages the baseline OMP configuration assets from the source `omp-config` repository as installable plugin content.

## Contents

- `assets/CLAUDE.md` and root or agent config templates.
- `assets/WORKFLOW_CATALOG.md` is the shared advisory workflow, TODO, skill-selection, and multi-subagent protocol, including exact direct agent IDs and per-role delegation duties.
- `assets/AGENTS.md` and `assets/WATCHDOG.yml` both import the installed `OMP_ENHANCER_WORKFLOW_CATALOG.md`, so OMP's native `@`-import expansion gives the main agent and Advisor the same catalog.
- `assets/config.yml`, `assets/models.yml`, and `assets/mcp.json` remain templates only.
- `assets/config.yml` includes `modelRoles.tiny` for optional lightweight tasks; workflow selection remains with the main agent.
- `agents/`, `skills/`, and `hooks/` copied from the config source.
- Slash command content for `/omp-config:config`, `/omp-config:config-doctor`, and `/omp-config:config-assets`.
- Runtime tools for extension loading: `omp_config_doctor`, `omp_config_assets`, `omp_config_plan`, and `omp_config_sync_workflow_context`.

## Safety

This package does not automatically overwrite `~/.omp`. Treat the packaged files as templates and review any patch plan before applying changes to a live OMP home.

`omp_config_sync_workflow_context` defaults to dry-run. It manages the dedicated `OMP_ENHANCER_WORKFLOW_CATALOG.md` file and marker-delimited blocks in `AGENTS.md` and `WATCHDOG.yml`; unrelated `AGENTS.md` and Advisor content is preserved. The catalog itself also carries managed markers, and sync refuses to overwrite a same-named user-owned file without them. Set `apply: true` only after reviewing the reported target and actions. The sync rejects incomplete managed markers, unsupported non-literal Advisor instructions, and symlinked destination files rather than guessing.

The destructive-command and malformed edit-anchor guard hooks are advisory-only:
they produce UI warnings but never return `block: true`. Other packaged
DeepSeek compatibility hooks can format results or repair malformed tool input
only after a user explicitly copies and enables those templates; the plugin
does not activate them automatically, and they are not permission gates.
Bundled agents do not declare `blocking: true`, and the config template disables
`loopGuard` plus compaction `autoContinue` by default. Host sandboxing, approval,
and system safety policy remain independent of this plugin.

The packaged main-agent and Advisor instructions are prompt guidance only. They
do not change host approval, block a tool call, or schedule an agent continuation.

The optional diagnostic classifier does not select the active workflow. If invoked explicitly, it may reuse OMP Tiny:

```yaml
modelRoles:
  tiny: opencode-go/deepseek-v4-flash:medium
```

`/model` changes the active session model. The primary request path does not run classifier preflight; the main agent chooses and composes workflows from the injected catalog.

## Commands

- `/omp-config:config` explains the package contents.
- `/omp-config:config-doctor` asks the runtime tool to inspect packaged config risks.
- `/omp-config:config-assets` asks the runtime tool to list packaged content.

## Bundled Skills

The plugin ships `skills/` as plugin content, declares it through `pi.skills`,
and lists these paths in the root marketplace catalog.
Installed marketplace packages include:

- All 12 source `agent/skills` entries from `sakuradairong/omp-config`.
- All 17 existing top-level source workflow skills under `skills/`.
- Three Beamer workflow skills for deck generation and modification, designer/visioner layout QA, story planning, and user-command PowerPoint conversion.
- One SVG flowchart skill with deterministic source validation and designer/visioner rendered review.
- All 249 source ECC skills under `skills/ecc/`.

The marketplace catalog registers every directory containing a `SKILL.md`, including nested paths such as `./skills/ecc/accessibility`.

## Runtime tools

When the extension entrypoint is loaded, the plugin registers:

| Tool | Purpose |
| --- | --- |
| `omp_config_doctor` | Reports basic package and safe-application checks without modifying files. |
| `omp_config_assets` | Lists packaged agents, skills, hooks, and config templates. |
| `omp_config_plan` | Produces a manual review plan before applying templates to a target OMP home. |
| `omp_config_sync_workflow_context` | Dry-runs or explicitly applies the shared catalog and managed context blocks to a target OMP agent directory. |

Example preview and explicit apply tool inputs:

```json
{"target":"/home/example/.omp/agent"}
```

```json
{"target":"/home/example/.omp/agent","apply":true}
```

The target defaults to `PI_CODING_AGENT_DIR` when set, otherwise `~/.omp/agent`.

## Validation

Use `npm run pack:dry` from this directory to verify the package includes the copied assets and plugin metadata.
