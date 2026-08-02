# OMP Enhancer

OMP Enhancer is an OMP marketplace for optional workflows, shared config, writing, testing, fact checking, and editable Mermaid diagrams.

OMP exposes available Skills and Agents; Main chooses under native permissions. Plugins neither hard-route nor block, continue sessions, or auto-repair.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `omp-enhancer-core` | Task facts, tool activation, and scoped reminders. |
| `omp-config` | Config, workflow references, Agents, Skills, and diagnostics. |
| `writing-helper` | English and Chinese writing, citation, style, and polish. |
| `omp-testing-enhancer` | Testing evidence and advisory review. |
| `omp-fact-checker` | Claim evidence, cross-checking, and advisory review. |
| `mermaid-helper` | Bounded Mermaid rendering via `mermaid_render` (code-first, revision-bound SVG evidence). |

## Workflows

Describe the task naturally. Main remains responsible for selecting Skills, Agents, tools, and execution steps under the user instruction and OMP's native permissions.

`omp-config` exposes the optional `omp-enhancer-workflows` reference catalog. It covers 5 domains: code, writing, research, visual, and operations. Main reads `skill://omp-enhancer-workflows` for non-trivial work and selects the matching domain and Skills; a mechanical field lookup without analysis uses no Skill or TODO.

Its discovery columns are explicit: `D` is a top-level Skill exact URI; `C` is an enumerated nested ECC exact URI. Skills provide methods and evidence rules; the domain cards are advisory.

Writing covers prose in any language and format (English, Chinese, LaTeX, Markdown, Beamer, Word). Main selects the matching language and format Skills directly; there is no separate pending workflow.

Diagrams are authored as Mermaid source and rendered with `mermaid_render`; the visual workflow lets `designer` author the complete Mermaid source in one pass and has Main perform a simple check of the rendered SVG.

Main orchestrates through ANALYZE -> EXECUTE -> REVIEW: it analyzes directly for focused work or delegates to the `analyzer` agent for complex multi-slice work, executes directly for simple changes or delegates to `task`/domain agents for substantial work, and reviews simple changes directly or delegates to `reviewer` for complex or risky changes. A concrete safety, capacity, input, or dependency limit records direct fallback. This is not a gate, router, fixed fan-out, or automatic loop.

You may name a workflow domain to constrain a request, for example:

```text
Use code + security. Review only; do not modify files.
```

Workflow names provide planning context only. They never grant permission to write, execute, publish, or access the network.

## Install

Add the marketplace and install:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer mermaid-helper@omp-enhancer
```

For a local checkout:

```bash
omp plugin marketplace add /path/to/omp-enhancer
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer mermaid-helper@omp-enhancer
```

Then run `npm run install:deps` once to fetch plugin runtime dependencies (`@mermaid-js/mermaid-cli` and `puppeteer` for Mermaid rendering). Start a new OMP session after installing or upgrading plugins.

## Use

Extension tools except mermaid-helper are inactive by default so they do not enlarge the normal prompt; mermaid-helper tools are active when the plugin loads. Enable or disable groups as needed:

```text
/enhancer-tools status
/enhancer-tools enable <core|config|writing|fact|test|mermaid|all>
/enhancer-tools disable <core|config|writing|fact|test|mermaid|all>
```

Activation exposes tool schemas; it grants no filesystem, command, network, or publication permission.

Common optional tools include:

- writing checks such as `writing_logic_check` and `writing_quality_check`;
- testing analysis, browser, coverage, mutation, `omp_test_review`, and report tools;
- fact analysis, evidence, report, and `fact_check_review` tools;
- config diagnostics and managed-context synchronization.
- Mermaid diagrams authored as code and rendered to revision-bound SVG via `mermaid_render`.

Review tools return advisory findings; they do not execute project commands, block work, or decide completion. Testing commands use the host-authorized shell; there is no plugin `/test` command. `/fact-check` remains available for explicit claim analysis.

To preview and apply the optional managed Main/Advisor context after enabling Config tools:

```text
Call omp_config_sync_workflow_context with apply=false.
Review the proposed changes, then call it with apply=true if desired.
```

Sync preserves unrelated `AGENTS.md` and `WATCHDOG.yml` content. Main and Advisor model selection is user-configured; the plugin does not bind to any specific model. Reminders remain advisory.

## Upgrade

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade
```

The marketplace tracks GitHub `main`; catalog `ref` pins are not part of the release contract. Re-run `npm run install:deps` after upgrading.

## Documentation

- [Architecture and runtime contracts](docs/ARCHITECTURE.md)
- [Development, validation, and release guide](docs/DEVELOPMENT.md)
- [Workflow definition and generation guide](docs/WORKFLOW_DEVELOPMENT.md)
- [OMP Enhancer self-development method](docs/OMP_ENHANCER_SELF_DEVELOPMENT.md)
- [Workflow and Skill E2E testing](docs/WORKFLOW_E2E_TESTING.md)
- [Mermaid pipeline contract](docs/MERMAID_PIPELINE.md)
- Plugin guides: [Config](plugins/omp-config/README.md), [Writing](plugins/writing-helper/README.md), [Testing](plugins/omp-test-enhancer/README.md), [Fact checking](plugins/omp-fact-checker/README.md), and [Mermaid](plugins/mermaid-helper/README.md)
- [Historical design archive](docs/superpowers/README.md)
