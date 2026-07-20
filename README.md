# OMP Enhancer

OMP Enhancer is an OMP marketplace for optional workflows, shared config, writing, testing, and fact checking.

OMP exposes available Skills and Agents; Main chooses under native permissions. Plugins neither hard-route nor block, continue sessions, or auto-repair.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `omp-enhancer-core` | Task facts, tool activation, and scoped reminders. |
| `omp-config` | Config, workflow references, Agents, Skills, and diagnostics. |
| `writing-helper` | English and Chinese writing, citation, style, and polish. |
| `omp-testing-enhancer` | Testing evidence and advisory review. |
| `omp-fact-checker` | Claim evidence, cross-checking, and advisory review. |

## Workflows

Describe the task naturally. Main remains responsible for selecting Skills, Agents, tools, and execution steps under the user instruction and OMP's native permissions.

`omp-config` exposes the optional `omp-enhancer-workflows` index. Only the exact native `skill-prompt` body named `omp-enhancer-workflows` counts as supplied; managed context, a Skill list, or another body does not. Otherwise Main reads `skill://omp-enhancer-workflows` alone first. It covers writing, research, fact checking, code, infrastructure, design, security, and release work.

Its discovery columns are explicit: `D` is a top-level Skill exact URI; `C` is an enumerated nested ECC exact URI. A selected `D` or `C` URI goes directly into `WORKFLOW PLAN` and `NOW`; only an unenumerated long-tail ECC method requires `skill://ecc-skill-catalog`. Workflow references stay in `THEN`.

Writing choices are grouped as language, format overlays, and specialized outputs. For prose, `writing.en` or `writing.zh` is Primary and a requested format such as LaTeX is an Add-on; a format workflow is Primary only for format- or structure-only work.

The PLAN response starts at byte 0 with `WORKFLOW PLAN`, loads declared resources, and waits. After loading, the READY response starts at byte 0 with `WORKFLOW READY | ...`, rebases the detailed TODO, initializes native TODO only when available, and waits before project work. Mechanical field lookups without analysis use no Skill or TODO.

Non-simple workflows softly default to subagent-driven execution when matching Agents are available. Main owns integration, verification, permissions, and effects; independent work may run in parallel. A concrete safety, capacity, input, or dependency limit records direct fallback. Code adds RED/GREEN slices, `MAIN REVIEW`, and reviewer reconciliation. This is not a gate, router, fixed fan-out, or automatic loop.

You may name workflow IDs to constrain a request, for example:

```text
Use code.dev + security.review. Review only; do not modify files.
```

Workflow names provide planning context only. They never grant permission to write, execute, publish, or access the network.

## Install

Add the GitHub marketplace and install the full stack:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer
```

For a local checkout:

```bash
omp plugin marketplace add /path/to/omp-enhancer
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer
```

Start a new OMP session after installing or upgrading plugins that change config, Agents, or Skills.

## Use

All extension tools are inactive by default so they do not enlarge the normal prompt. Enable only the group needed in the current session:

```text
/enhancer-tools status
/enhancer-tools enable <core|config|writing|fact|test|all>
/enhancer-tools disable <core|config|writing|fact|test|all>
```

Activation only exposes tool schemas. It does not grant filesystem, command, network, or publication permission.

Common optional tools include:

- writing checks such as `writing_logic_check` and `writing_quality_check`;
- testing analysis, browser, coverage, mutation, `omp_test_review`, and report tools;
- fact analysis, evidence, report, and `fact_check_review` tools;
- config diagnostics and managed-context synchronization.

Review tools return advisory findings; they do not execute project commands, block work, or decide completion. Testing commands use the host-authorized shell; there is no plugin `/test` command. `/fact-check` remains available for explicit claim analysis.

To preview and apply the optional managed Main/Advisor context after enabling Config tools:

```text
Call omp_config_sync_workflow_context with apply=false.
Review the proposed changes, then call it with apply=true if desired.
```

Sync preserves unrelated `AGENTS.md` and `WATCHDOG.yml` content. Defaults are `opencode-go/deepseek-v4-flash:max` for Main and `openai-codex/gpt-5.6-luna:xhigh` for Advisor; MiMo v2.5 is an explicit alternative. Reminders remain advisory.

## Upgrade

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade
```

The marketplace always tracks GitHub `main`; catalog `ref` pins are not part of the release contract.

## Documentation

- [Architecture and runtime contracts](docs/ARCHITECTURE.md)
- [Development, validation, and release guide](docs/DEVELOPMENT.md)
- [Workflow definition and generation guide](docs/WORKFLOW_DEVELOPMENT.md)
- [OMP Enhancer self-development method](docs/OMP_ENHANCER_SELF_DEVELOPMENT.md)
- [Workflow and Skill E2E testing](docs/WORKFLOW_E2E_TESTING.md)
- Plugin guides: [Config](plugins/omp-config/README.md), [Writing](plugins/writing-helper/README.md), [Testing](plugins/omp-test-enhancer/README.md), and [Fact checking](plugins/omp-fact-checker/README.md)
- [Historical design archive](docs/superpowers/README.md)
