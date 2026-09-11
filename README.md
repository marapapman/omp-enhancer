# OMP Enhancer

OMP Enhancer is an OMP marketplace for optional workflows, shared config, writing, fact checking, draw.io diagrams, and provider plugins for Command Code, Volcengine Ark Coding Plan, and Alibaba Cloud Bailian Token Plan model access.

OMP exposes available Skills and Agents; Main chooses under native permissions. Plugins neither hard-route nor block, continue sessions, or auto-repair.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `omp-config` | Config, workflow references, Agents, Skills, and diagnostics. |
| `writing-helper` | English and Chinese writing, citation, style, and polish. |
| `omp-fact-checker` | Claim evidence, cross-checking, and advisory review. |
| `volcengine-coding-plan` | Native `/login` and `/model` access to Ark Coding Plan models. |
| `commandcode` | Native `/login` and `/model` access to Command Code Provider API models. |
| `aliyun-bailian-token-plan` | Native `/login` and `/model` access to Alibaba Cloud Bailian Token Plan models. |

## Workflows

Describe the task naturally. Main selects Skills, Agents, tools, and execution steps under OMP's native permissions.

`omp-config` exposes the optional `omp-enhancer-workflows` reference catalog. It covers 3 domains: writing, research (fact-checking), and visual. Main reads `skill://omp-enhancer-workflows` for non-trivial work and selects the matching domain and Skills; a mechanical field lookup without analysis uses no Skill or TODO.

`D` is a top-level Skill exact URI; Skills provide methods and evidence rules.

Writing covers prose in any language and format (English, Chinese, LaTeX, Markdown, Beamer, Word). Main selects the matching language and format Skills directly; there is no separate pending workflow.

- Draw.io pipeline remains unchanged: diagrams use `drawio-skill` from `drawio@365-skills`; task draws once and exports a draft PNG, and Main (or a task that did not draw the revision) reviews that PNG read-only in one pass for edges pressed onto each other or crossing through boxes, and task applies at most one fix round.
- Beamer remains a writing-format overlay. It uses a Markdown content plan as the canonical content source; Beamer .tex files are derived layout artifacts. Content changes go to Markdown, are reconfirmed with the user, then regenerate Beamer. A single read-only visual precheck is performed by Main or task after task's initial render and before the task layout pass; task then renders the final revision.

Main orchestrates through ANALYZE -> EXECUTE -> REVIEW: executing simple changes directly, delegating substantial work to `task`/domain agents, and delegating complex or risky review to `reviewer`. This is not a gate, router, fixed fan-out, or automatic loop.

You may name a workflow domain to constrain a request, for example:

```text
Use writing. Review only; do not modify files.
```

Workflow names provide planning context only. They never grant permission to write, execute, publish, or access the network.

## Install

Add the marketplace and install:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-fact-checker@omp-enhancer volcengine-coding-plan@omp-enhancer commandcode@omp-enhancer aliyun-bailian-token-plan@omp-enhancer
```

For a local checkout:

```bash
omp plugin marketplace add /path/to/omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-fact-checker@omp-enhancer volcengine-coding-plan@omp-enhancer commandcode@omp-enhancer aliyun-bailian-token-plan@omp-enhancer
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
- draw.io diagrams drawn with `drawio-skill` (drawio@365-skills) and reviewed once read-only by Main (or a task that did not draw the revision).

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
- Plugin guides: [Config](plugins/omp-config/README.md), [Writing](plugins/writing-helper/README.md), [Fact checking](plugins/omp-fact-checker/README.md), [Volcengine Coding Plan](plugins/volcengine-coding-plan/README.md), [Command Code](plugins/commandcode/README.md), and [Alibaba Bailian Token Plan](plugins/aliyun-bailian-token-plan/README.md)
- [Historical design archive](docs/superpowers/README.md)