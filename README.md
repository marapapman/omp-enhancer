# OMP Enhancer

OMP Enhancer is an OMP marketplace for optional workflows, shared config, writing, fact checking, draw.io diagrams, Volcengine Ark Coding Plan, and Alibaba Cloud Bailian Token Plan model access.

OMP exposes available Skills and Agents; Main chooses under native permissions. Plugins neither hard-route nor block, continue sessions, or auto-repair.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `omp-config` | Config, workflow references, Agents, Skills, and diagnostics. |
| `writing-helper` | English and Chinese writing, citation, style, and polish. |
| `omp-fact-checker` | Claim evidence, cross-checking, and advisory review. |
| `volcengine-coding-plan` | Native `/login` and `/model` access to Ark Coding Plan models. |
| `aliyun-bailian-token-plan` | Native `/login` and `/model` access to Alibaba Cloud Bailian Token Plan models. |

## Workflows

Describe the task naturally. Main remains responsible for selecting Skills, Agents, tools, and execution steps under the user instruction and OMP's native permissions.

`omp-config` exposes the optional `omp-enhancer-workflows` reference catalog. It covers 3 domains: writing, research (fact-checking), and visual. Main reads `skill://omp-enhancer-workflows` for non-trivial work and selects the matching domain and Skills; a mechanical field lookup without analysis uses no Skill or TODO.

Its discovery column is explicit: `D` is a top-level Skill exact URI. Skills provide methods and evidence rules; the domain cards are advisory.

Writing covers prose in any language and format (English, Chinese, LaTeX, Markdown, Beamer, Word). Main selects the matching language and format Skills directly; there is no separate pending workflow.

- Draw.io pipeline remains unchanged: diagrams use `drawio-skill` from `drawio@365-skills`; task draws once and exports a draft PNG, visioner reviews that PNG read-only in one pass for edges pressed onto each other or crossing through boxes, and task applies at most one fix round.
- Beamer remains a writing-format overlay, not the visual workflow. New decks first use a text-only, page-by-page Markdown content plan and user discussion; the Markdown file is the canonical content source and must be confirmed before any Beamer frame or layout work. Only then is the confirmed plan translated into Beamer frames and laid out. Beamer .tex files are derived layout artifacts: Content changes go to Markdown first, are discussed and reconfirmed with the user, then regenerate Beamer; never edit their content to settle uncertainty during layout. After the user confirms the basic layout, the existing visual refinement path applies: a single read-only visual precheck is performed by Main or task after task's initial render and before the task layout pass, findings are advisory, task integrates and renders the final revision, and visioner independently reviews fresh final evidence. Chinese slide text uses the applicable Chinese writing Skills to keep complete natural sentences and remove evidence-based AI-like phrasing. PowerPoint conversion uses only a user-supplied exact command.

Main orchestrates through ANALYZE -> EXECUTE -> REVIEW: it executes directly for simple changes or delegates to `task`/domain agents for substantial work, and reviews simple changes directly or delegates to `reviewer` for complex or risky changes. A concrete safety, capacity, input, or dependency limit records direct fallback. This is not a gate, router, fixed fan-out, or automatic loop.

You may name a workflow domain to constrain a request, for example:

```text
Use writing. Review only; do not modify files.
```

Workflow names provide planning context only. They never grant permission to write, execute, publish, or access the network.

## Install

Add the marketplace and install:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-fact-checker@omp-enhancer volcengine-coding-plan@omp-enhancer aliyun-bailian-token-plan@omp-enhancer
```

For a local checkout:

```bash
omp plugin marketplace add /path/to/omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-fact-checker@omp-enhancer volcengine-coding-plan@omp-enhancer aliyun-bailian-token-plan@omp-enhancer
```

Start a new OMP session after installing or upgrading plugins.

## Use

Extension tools are inactive by default so they do not enlarge the normal prompt; activate groups as needed:

```text
/enhancer-tools status
/enhancer-tools enable <config|writing|fact|all>
/enhancer-tools disable <config|writing|fact|all>
```

Activation exposes tool schemas; it grants no filesystem, command, network, or publication permission.

Common optional tools include:

- writing checks such as `writing_logic_check` and `writing_quality_check`;
- fact analysis, evidence, report, and `fact_check_review` tools;
- config diagnostics and managed-context synchronization;
- draw.io diagrams drawn with `drawio-skill` (drawio@365-skills) and reviewed once by `visioner`.

Review tools return advisory findings; they do not execute project commands, block work, or decide completion. `/fact-check` remains available for explicit claim analysis.

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

The marketplace tracks GitHub `main`; catalog `ref` pins are not part of the release contract.

## Documentation

- [Architecture and runtime contracts](docs/ARCHITECTURE.md)
- [Development, validation, and release guide](docs/DEVELOPMENT.md)
- [Workflow definition and generation guide](docs/WORKFLOW_DEVELOPMENT.md)
- [Draw.io pipeline contract](docs/DRAWIO_PIPELINE.md)
- Plugin guides: [Config](plugins/omp-config/README.md), [Writing](plugins/writing-helper/README.md), [Fact checking](plugins/omp-fact-checker/README.md), [Volcengine Coding Plan](plugins/volcengine-coding-plan/README.md), and [Alibaba Bailian Token Plan](plugins/aliyun-bailian-token-plan/README.md)
- [Historical design archive](docs/superpowers/README.md)