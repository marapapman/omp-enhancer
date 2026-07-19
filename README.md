# OMP Enhancer

OMP Enhancer is an OMP marketplace stack for optional workflow guidance, shared configuration, writing QA, testing QA, and fact checking.

The stack is OMP-native-first. Main receives the available Skills and Agents through OMP and chooses how to work. Plugins do not hard-route a request, force a workflow, block tool calls, keep a session open, or start automatic repair turns.

## Plugins

| Plugin | Purpose |
| --- | --- |
| `omp-enhancer-core` | Safe task facts, optional tool activation, and scoped model reminders. |
| `omp-config` | Shared config, workflow references, Agents, Skills, hooks, and diagnostics. |
| `writing-helper` | Writing, citation, style, and polish tools for English and Chinese. |
| `omp-testing-enhancer` | Testing, browser, coverage, mutation, and advisory review tools. |
| `omp-fact-checker` | Claim planning, evidence, cross-checking, reporting, and advisory review. |

Each plugin can be installed independently.

## Workflows

Describe the task naturally. Main remains responsible for selecting Skills, Agents, tools, and execution steps under the user instruction and OMP's native permissions.

`omp-config` exposes `omp-enhancer-workflows` as an optional Skill. Its compact selection table keeps only exact workflow IDs, complete matching conditions, and per-workflow `PLAN URI` values to copy into the plan before loading. Main loads only the selected cards and chooses domain Skills from OMP's native visible Skill descriptions. The cards cover:

- writing, documents, slides, diagrams, and conversion;
- web research, citations, and fact checking;
- one consolidated `code.dev` lifecycle for substantive software work;
- network, database, ML, marketing, SEO, visual design, OMP plugin, security, and release work.

Substantive code work is subagent-driven when matching Agents are available: Main writes a reviewed parallel-slice plan; native `task` owns each vertical RED/GREEN slice; Main integrates, verifies, and writes `MAIN REVIEW`; native `reviewer` checks the supplied bounded evidence; supported repairs return to `task`. This is soft guidance, not a fixed fan-out, gate, router, or automatic loop. OMP Enhancer uses `omp.plugin` with the same `code-development` Skill.

For analysis, judgment, workflow composition, coordinated stages, or possible delegation, Main reads the compact workflow index first. It emits the exact `WORKFLOW PLAN` block before a resource-only load sequence, with domain Skills or catalogs first and workflow references last. It then emits `WORKFLOW READY | ...`, rebases the detailed TODO, and starts work. Native TODO is used when exposed and allowed; otherwise the same checklist remains the execution state. Mechanical field lookups without analysis use no Skill or TODO. The full catalog is not automatically injected into Main or Advisor context.

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

The review tools return structured findings. They do not execute project commands, block later work, or decide whether a session may finish. Fact checking aligns each verdict to the exact subject, predicate plus object/value, scope, time/version, and quantifier; it preserves limitations and counterchecks and treats zero findings as valid. Testing commands are run through the host-authorized shell; there is no plugin `/test` command. `/fact-check` remains available for explicit claim analysis.

To preview and apply the optional managed Main/Advisor context after enabling Config tools:

```text
Call omp_config_sync_workflow_context with apply=false.
Review the proposed changes, then call it with apply=true if desired.
```

The sync preserves unrelated `AGENTS.md` and `WATCHDOG.yml` content. The packaged configuration keeps Main on `opencode-go/deepseek-v4-flash:max` and Advisor on `openai-codex/gpt-5.6-luna:xhigh`; MiMo v2.5 remains an explicit model choice. Model-specific reminders and Advisor guidance are advisory and never select a workflow, fork, or completion condition.

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
