# OMP Enhancer

OMP Enhancer is an OMP marketplace for optional workflows, shared config, writing, fact checking, draw.io diagrams, and Volcengine Ark Coding Plan and OpenDesign (AMR) model access.

OMP exposes available Skills and Agents; Main chooses under native permissions. Plugins neither hard-route nor block, continue sessions, or auto-repair.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `omp-config` | Config, workflow references, Agents, Skills, and diagnostics. |
| `writing-helper` | English and Chinese writing, citation, style, and polish. |
| `omp-fact-checker` | Claim evidence, cross-checking, and advisory review. |
| `volcengine-coding-plan` | Native `/login` and `/model` access to Ark Coding Plan models. |
| `opendesign-coding-plan` | OpenDesign (AMR) models with Vela CLI sign-in and Design Plan quota. |

## Workflows

Describe the task naturally. Main selects Skills, Agents, tools, and steps under OMP's native permissions.

The optional `omp-enhancer-workflows` catalog in `omp-config` covers 3 domains: writing, research (fact-checking), and visual. Main reads `skill://omp-enhancer-workflows` for non-trivial work and selects the matching domain and Skills; a mechanical field lookup uses no Skill or TODO.

`D` is a top-level Skill exact URI; Skills give methods and evidence rules.

Writing covers prose in any language and format (English, Chinese, LaTeX, Markdown, Beamer, Word). Main selects the matching language and format Skills; there is no separate pending workflow.

- Draw.io pipeline via `drawio-skill` (`drawio@365-skills`); task draws once and exports a draft PNG; Main (or a task that did not draw the revision) reviews that PNG read-only once for pressed edges or crossed boxes; task applies at most one fix round.
- Beamer overlays writing in three editing modes: storyline-only (Markdown plan), Beamer-only (.tex/PDF), and PPTX-only (.pptx). Edits stay inside the chosen target, whose current revision is the baseline; counterparts stay read-only, and divergence triggers no realignment, propagation, or overwrite. Only explicit generation or conversion consumes a source snapshot: confirm page content, a separate task reconciles slide order on the unchanged plan (reconfirm on material reorders), then task converts and renders. For Beamer→PPTX the Beamer PDF is the visual authority; editing an existing .pptx uses officecli and never regenerates from Beamer. A single read-only visual precheck is performed by Main or task after task's initial render and before the task layout pass; task renders the final revision.

Main orchestrates through ANALYZE -> EXECUTE -> REVIEW: simple changes execute directly, substantial work goes to `task`/domain agents, complex or risky review to `reviewer`. No gate, router, fixed fan-out, or automatic loop.

Name a workflow domain to constrain a request:

```text
Use writing. Review only; do not modify files.
```

Workflow names are planning context; they grant no permission to write, execute, publish, or access the network.

## Install

Add the marketplace and install:

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-fact-checker@omp-enhancer volcengine-coding-plan@omp-enhancer opendesign-coding-plan@omp-enhancer
```

For a local checkout:

```bash
omp plugin marketplace add /path/to/omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-fact-checker@omp-enhancer volcengine-coding-plan@omp-enhancer opendesign-coding-plan@omp-enhancer
```

Start a new OMP session after installing or upgrading.

## Use

Most extension tools are inactive by default so they do not enlarge the normal prompt; activate groups as needed:

```text
/enhancer-tools status
/enhancer-tools enable <config|writing|fact|all>
/enhancer-tools disable <config|writing|fact|all>
```

The `fact_check_*` pipeline tools ship in the default tool inventory, so a plain request like “check the facts in docs/draft.md” reaches `fact_check_analyze` → `fact_check_evidence` → `fact_check_report` → `fact_check_review` with no activation step.

Activation exposes tool schemas and grants no filesystem, command, network, or publication permission.

Common optional tools:

- writing checks such as `writing_logic_check` and `writing_quality_check`;
- fact analysis, evidence, report, and `fact_check_review` tools;
- config diagnostics and managed-context synchronization;
- draw.io diagrams drawn with `drawio-skill` (drawio@365-skills), reviewed once read-only.

Review tools return advisory findings; they never execute project commands, block work, or decide completion. `/fact-check` remains available for explicit claim analysis.

To preview and apply the managed Main/Advisor context after enabling Config tools:

```text
Call omp_config_sync_workflow_context with apply=false.
Review the changes, then call it with apply=true if desired.
```

Sync preserves unrelated `AGENTS.md` and `WATCHDOG.yml` content. The packaged config template ships model role defaults; Main and Advisor selection stays user-overridable and reminders stay advisory.

## Upgrade

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade
```

The marketplace tracks GitHub `main`; catalog `ref` pins are outside the release contract.

## Documentation

- [Architecture and contracts](docs/ARCHITECTURE.md)
- [Development, validation, and release guide](docs/DEVELOPMENT.md)
- [Workflow definition and generation guide](docs/WORKFLOW_DEVELOPMENT.md)
- [Draw.io pipeline contract](docs/DRAWIO_PIPELINE.md)
- Plugin guides: [Config](plugins/omp-config/README.md), [Writing](plugins/writing-helper/README.md), [Fact checking](plugins/omp-fact-checker/README.md), [Volcengine Coding Plan](plugins/volcengine-coding-plan/README.md), [OpenDesign](plugins/opendesign-coding-plan/README.md)
- [Historical design archive](docs/superpowers/README.md)