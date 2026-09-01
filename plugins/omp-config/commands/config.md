# OMP Config

This plugin provides OMP config assets, agents, skills, hooks, and safe config diagnostics.

Use:

- `/omp-config:config-doctor` to inspect config risks.
- `/omp-config:config-assets` to list packaged assets.

Packaged configuration templates (for example, `assets/config.yml` and `assets/mcp.json`) are not installed or overwritten automatically.
Managed workflow context (`AGENTS.md`, `WATCHDOG.yml`, and `OMP_ENHANCER_WORKFLOW_CATALOG.md`) is synchronized at session start by default, preserving content outside managed markers. Set `OMP_ENHANCER_DISABLE_CONFIG_AUTO_SYNC=1` to skip that sync.
