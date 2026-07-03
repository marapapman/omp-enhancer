# OMP Config

`omp-config` packages the baseline OMP configuration assets from the source `omp-config` repository as installable plugin content.

## Contents

- `assets/CLAUDE.md` and root or agent config templates.
- `assets/config.yml`, `assets/models.yml`, and `assets/mcp.json` as templates only.
- `agents/`, `skills/`, and `hooks/` copied from the config source.
- Slash command content for `/omp-config:config`, `/omp-config:config-doctor`, and `/omp-config:config-assets`.
- Runtime tools for extension loading: `omp_config_doctor`, `omp_config_assets`, and `omp_config_plan`.

## Safety

This package does not automatically overwrite `~/.omp`. Treat the packaged files as templates and review any patch plan before applying changes to a live OMP home.

## Commands

- `/omp-config:config` explains the package contents.
- `/omp-config:config-doctor` asks the runtime tool to inspect packaged config risks.
- `/omp-config:config-assets` asks the runtime tool to list packaged content.

## Bundled Skills

The plugin ships `skills/` as plugin content, declares it through `pi.skills`,
and lists these paths in the root marketplace catalog.
Installed marketplace packages include these skill names:

- `caveman`
- `conventional-commits`
- `deepseek-tool-calling`
- `diagnose`
- `docker-compose`
- `go-testing`
- `grill-with-docs`
- `handoff`
- `improve-codebase-architecture`
- `prototype`
- `tdd`
- `zoom-out`

## Runtime tools

When the extension entrypoint is loaded, the plugin registers:

| Tool | Purpose |
| --- | --- |
| `omp_config_doctor` | Reports basic package and safe-application checks without modifying files. |
| `omp_config_assets` | Lists packaged agents, skills, hooks, and config templates. |
| `omp_config_plan` | Produces a manual review plan before applying templates to a target OMP home. |

## Validation

Use `npm run pack:dry` from this directory to verify the package includes the copied assets and plugin metadata.
