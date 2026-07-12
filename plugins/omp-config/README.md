# OMP Config

`omp-config` packages the baseline OMP configuration assets from the source `omp-config` repository as installable plugin content.

## Contents

- `assets/CLAUDE.md` and root or agent config templates.
- `assets/config.yml`, `assets/models.yml`, and `assets/mcp.json` as templates only.
- `assets/config.yml` includes `modelRoles.tiny`, the OMP Tiny role reused by `omp-enhancer-core` for schema-first route classification when the deterministic router is ambiguous.
- `agents/`, `skills/`, and `hooks/` copied from the config source.
- Slash command content for `/omp-config:config`, `/omp-config:config-doctor`, and `/omp-config:config-assets`.
- Runtime tools for extension loading: `omp_config_doctor`, `omp_config_assets`, and `omp_config_plan`.

## Safety

This package does not automatically overwrite `~/.omp`. Treat the packaged files as templates and review any patch plan before applying changes to a live OMP home.

The destructive-command and malformed edit-anchor guard hooks are advisory-only:
they produce UI warnings but never return `block: true`. Other packaged
DeepSeek compatibility hooks can format results or repair malformed tool input
only after a user explicitly copies and enables those templates; the plugin
does not activate them automatically, and they are not permission gates.
Bundled agents do not declare `blocking: true`, and the config template disables
`loopGuard` plus compaction `autoContinue` by default. Host sandboxing, approval,
and system safety policy remain independent of this plugin.

The LLM classifier does not use a separate classifier role. It reuses OMP Tiny:

```yaml
modelRoles:
  tiny: opencode-go/deepseek-v4-flash:medium
```

`/model` changes the active session model. Classifier preflight should dispatch through `modelRoles.tiny`; do not create or maintain a classifier-specific model role.

## Commands

- `/omp-config:config` explains the package contents.
- `/omp-config:config-doctor` asks the runtime tool to inspect packaged config risks.
- `/omp-config:config-assets` asks the runtime tool to list packaged content.

## Bundled Skills

The plugin ships `skills/` as plugin content, declares it through `pi.skills`,
and lists these paths in the root marketplace catalog.
Installed marketplace packages include:

- All 12 source `agent/skills` entries from `sakuradairong/omp-config`.
- All 17 top-level source workflow skills under `skills/`.
- All 249 source ECC skills under `skills/ecc/`.

The marketplace catalog registers every directory containing a `SKILL.md`, including nested paths such as `./skills/ecc/accessibility`.

## Runtime tools

When the extension entrypoint is loaded, the plugin registers:

| Tool | Purpose |
| --- | --- |
| `omp_config_doctor` | Reports basic package and safe-application checks without modifying files. |
| `omp_config_assets` | Lists packaged agents, skills, hooks, and config templates. |
| `omp_config_plan` | Produces a manual review plan before applying templates to a target OMP home. |

## Validation

Use `npm run pack:dry` from this directory to verify the package includes the copied assets and plugin metadata.
