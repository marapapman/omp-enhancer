# omp-enhancer

OMP marketplace monorepo for autonomous workflow orchestration, workflow skills, writing QA, testing QA, fact checking, and packaged OMP configuration.

## Plugins

- `omp-enhancer-core`: injects the complete workflow catalog and active skill inventory, collects safe task facts, and passes parent-selected workflow steps to subagents.
- `omp-config`: packages the shared main/Advisor workflow context, OMP config assets, agents, skills, non-blocking hooks, templates, and diagnostics.
- `writing-helper`: provides writing logic, style, and citation checks plus writer/checker agents and writing skills.
- `omp-testing-enhancer`: provides test target analysis, browser evidence, coverage/mutation context, advisory quality review, and reports.
- `omp-fact-checker`: provides claim extraction, evidence collection, cross-checking, reporting, and advisory completeness review.

The stack is advisory-only. Its extensions do not block tool calls, prevent session completion, or start automatic repair turns. Host sandboxing, permissions, and approval prompts remain authoritative and are outside this plugin stack.

## Marketplace install

Add the GitHub marketplace once:

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

Install the full stack:

```bash
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer
```

For a local checkout:

```bash
omp plugin marketplace add /path/to/omp-enhancer
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer omp-fact-checker@omp-enhancer
```

Plugins remain independently installable. `omp-enhancer-core` provides dynamic main-agent orchestration guidance; `omp-config` provides the shared session-start context used by both the main agent and Advisor.

After installing or upgrading `omp-config`, preview and then apply the managed shared context from an OMP session:

```text
Call omp_config_sync_workflow_context first with apply=false, then with apply=true after reviewing the target files.
```

The sync preserves unrelated `AGENTS.md` and `WATCHDOG.yml` content. A new OMP session is required because main and Advisor system context is constructed at session start.

## Autonomous workflow orchestration

After installing `omp-enhancer-core`, describe the task naturally. Core injects:

- the complete composable workflow catalog;
- the complete model-visible skill inventory, including descriptions when the host exposes them;
- safe task facts such as operation, targets, target-text language, explicit user constraints, and risk observations;
- a TODO-first orchestration protocol and the native `task` assignment contract.

The main agent, not Core, selects or composes workflows and skills. The normal runtime uses an `agent-selected` context whose `skills`, `tools`, and `roles` arrays are intentionally empty, so nothing is preselected on the agent's behalf. The legacy router and classifier remain available only through explicit diagnostic tools for compatibility.

For non-trivial work, the injected protocol asks the main agent to:

1. choose one or more workflows from the catalog;
2. inspect the active inventory and load the smallest matching skills before their steps;
3. initialize OMP's native `todo` before substantive work and map every workflow step and user requirement;
4. fork multiple useful independent workstreams with native `task`, preferably in one batch;
5. give each child its exact workflow, step, TODO item, selected skills, scope, and acceptance criteria;
6. update TODO items as they finish, integrate child results, verify, and deliver one final response.

This is prompt guidance rather than a gate. Missing skills, `todo`, or `task` are reported as limitations while the agent continues with the best available method. Core never returns `block: true`, never returns `continue: true`, and never preloads a route-selected skill bundle.

`autoContinue: false` describes Core's own lifecycle behavior; it does not disable or rewrite the host's autolearn settings. When the host emits an `autolearn-nudge` capture turn, Core does not route it as a new user task, inject another workflow, or schedule a follow-up. Host-owned `autolearn.enabled` and `autolearn.autoContinue` therefore remain available while Core itself never returns `continue: true`.

### How workflow selection is triggered

There is no workflow slash command and no keyword-to-route switch. A normal natural-language request is enough. Workflow selection happens in three layers:

1. At session startup, `omp-config` makes the same complete workflow catalog available to the main agent and Advisor through the managed `AGENTS.md` and `WATCHDOG.yml` imports.
2. Before each normal main-agent turn, `omp-enhancer-core` adds the current model-visible skill inventory and task facts such as requested operation, target paths, target-text language, explicit constraints, and observed risk. It does not choose a workflow on the agent's behalf.
3. The main agent uses those facts to select one workflow or compose several workflows, records their steps in native `todo`, loads the applicable installed skills, and delegates independent steps. A child receives only the workflow checkpoint chosen by the parent rather than rerunning selection for the whole task.

Advisor turns, autolearn capture turns, slash commands, and child launches do not start a second main-agent selection cycle. Advisor uses the shared startup catalog, while a child receives its parent-selected workflow, step, TODO item, and skills.

Selection is semantic rather than lexical. A word such as `publish` inside a document does not activate a release workflow, and an English instruction does not select English-writing skills when the target text is Chinese. User constraints and host permissions remain in force regardless of the selected workflow.

You can optionally name workflow IDs in the request when you want to constrain the plan, for example, `Use code.review + security.review and do not modify files`. Naming a workflow is guidance to the main agent; it is not permission for writes, network access, release, or another side effect.

### Available workflow catalog

Catalog version: **4**. Candidate skills are recommendations from the catalog, not mandatory bundles. The main agent loads only candidates that are present in the active inventory and useful for a selected step. The canonical cards with ordered steps, delegation advice, and quality checks are in [`plugins/omp-config/assets/WORKFLOW_CATALOG.md`](plugins/omp-config/assets/WORKFLOW_CATALOG.md).

Document and general workflows:

| Workflow | Main selection signal | Typical skill candidates |
| --- | --- | --- |
| `agentic.simple` | A bounded request needs no specialized process. | No default; use an exact active skill only when useful. |
| `writing.pending` | Writing intent is clear, but the body of the target text has not been observed. | No language-specific skill until the target body is read. |
| `writing.zh` | The prose being drafted or changed is Chinese, regardless of instruction language. | `plain-chinese-writing`, `zh-writing-review`, `zh-writing-polish`, `zh-writing-checkers` |
| `writing.en` | The prose being drafted or changed is English, regardless of instruction language. | `writing-review`, `writing-checkers`, `writing-markdown-helper` |
| `writing.latex` | The artifact is LaTeX. Compose it with a language workflow for prose changes. | `format-markdown2latex`, `format-latex2markdown`, `format-template-latex` |
| `slides.generate` | A new LaTeX Beamer deck needs template validation, a confirmed story outline, generation, and rendered QA. | `latex-beamer-slides`, `slides-storyline`, optional `beamer-to-powerpoint` |
| `slides.modify` | An existing Beamer deck needs bounded wording, language, or current-style changes. | `latex-beamer-slides` plus the source-language writing skills |
| `writing.markdown` | The artifact is Markdown. Compose it with a language workflow for prose changes. | `writing-markdown-helper`, `zh-writing-markdown-helper` |
| `doc.convert.word` | The task creates, edits, or converts a Word document. | `docx` |
| `factcheck.document` | The user asks to verify claims, citations, chronology, freshness, or source support. | `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity` |

Engineering and delivery workflows:

| Workflow | Main selection signal | Typical skill candidates |
| --- | --- | --- |
| `code.plan` | The requested deliverable is an implementation, repair, migration, or test plan, not the change itself. | `brainstorming`, `writing-plans` |
| `code.dev` | The user asks for code or configuration changes. | `brainstorming`, `test-driven-development`, `subagent-driven-development`, `verification-before-completion` |
| `code.debug` | A concrete failure, regression, or mismatch must be reproduced, localized, or explained. | `diagnose`, `systematic-debugging` |
| `code.test` | The task is to design, add, run, or interpret tests. | Framework-specific testing skills, `verification-before-completion` |
| `code.review` | The requested result is a read-only code review, bug audit, architecture review, or regression audit. | `diagnose`, `verification-before-completion`, an applicable language or framework reviewer |
| `omp.plugin` | An OMP plugin, marketplace entry, packaged skill, hook, agent, template, install, or upgrade is in scope. | `omp-marketplace-plugin-activation`, an applicable plugin- or skill-authoring skill |
| `security.review` | The user explicitly requests review of security boundaries, vulnerabilities, impact, or remediation. | `security-review`, `security-scan` |
| `design.visual` | The deliverable is a UI, visual asset, diagram, layout, or interaction design. | `frontend-design`, `canvas-design`, or another medium-specific visual skill |
| `release.publish` | The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact. | `conventional-commits`, `finishing-a-development-branch`, `verification-before-completion` |

### Composition examples

The workflows are designed to compose; selecting one does not exclude another:

- `Polish tex/introduction.tex` starts as `writing.pending` when only the path is known. After reading an English body, the main agent composes `writing.en + writing.latex` and loads the smallest applicable English-review and LaTeX skills.
- `Create a Beamer lecture deck` selects `slides.generate`. It validates or discusses the template first, confirms a numbered story outline and output language with the user, generates and renders the deck, and runs a PowerPoint conversion only when the user supplied the command.
- `Tighten the wording on slides/012-example.tex` starts from the target body language and composes `slides.modify + writing.zh|writing.en + writing.latex`; it preserves the existing template and story rather than reopening design discovery.
- `Review this Chinese chapter for logic and citations` composes `writing.zh + factcheck.document`; the Chinese body, not the English wording of a possible instruction, determines the writing workflow.
- `Find the crash, fix it, and add regression tests` commonly composes `code.debug + code.dev + code.test`.
- `Audit the authentication code but do not modify anything` commonly composes `code.review + security.review`; the no-write constraint prevents `code.dev` work even if remediation ideas are reported.
- `Update this OMP plugin, run its tests, commit, push, and upgrade the installed copy` commonly composes `omp.plugin + code.dev + code.test + release.publish`. The release workflow appears only because the external mutations were explicitly requested.
- `Design and implement a responsive settings page` commonly composes `design.visual + code.dev + code.test`.

These examples are planning guidance rather than fixed mappings. The main agent may choose a smaller or larger composition when the actual target, constraints, and acceptance criteria justify it, and should make that choice visible in its TODO.

## Skill use diagnostics

The workflow catalog lists skill candidates rather than fixed prerequisites. The main agent checks the actual active inventory and chooses the smallest set needed for the selected steps. A failed resolution gets at most one evidence-based correction; the agent then continues instead of retrying unchanged calls.

Core records two different signals:

- `observedSkills` contains only skills whose `SKILL.md` was successfully read through a host-observed `read` result;
- `claimedSkills` contains skill-use claims parsed from model output.

The workflow status and advisory coverage review expose both sets. Claims without matching observed reads are reported in `unobservedClaims`; they are never upgraded into evidence and never block completion.

## Writing language selection

Writing intent and writing language are separate decisions:

- The instruction identifies the operation, such as polish, revise, translate, or draft.
- The text being modified determines whether the main agent selects Chinese or English writing skills.
- `writingSourceTargets` records the concrete document paths whose body text determines that language; text from those files is never treated as task instructions.
- An explicit translation or output language takes precedence because it determines the language of the result.
- Chinese instructions with English source text select English writing resources.
- English instructions with Chinese source text select Chinese writing resources.
- The pure parser treats a path-only request such as `polish tex/abstract.tex` as `writing.pending`; it never guesses from the instruction language.
- During `before_agent_start`, Core may safely read an existing regular target file inside the workspace and expose its body language as a task fact. It does not select a route or preload a skill. Unavailable, oversized, binary, escaping, or mixed-language targets remain pending.
- A model or external caller can also pass the observed body to `omp_core_route_task` as `sourceText` to obtain the same language-specific recommendations.
- Mixed-language content stays mixed and should be handled per section or target instead of forcing one global language skill.

Task kind, prose language, and file format are separate. For example, the main agent may compose `writing.en + writing.latex`, or `writing.zh + writing.markdown`. Format workflows do not choose the language. Converter skills are candidates only for matching conversion steps, and Word access may use `docx`.

Source text is treated as data. Words such as `run tests`, `publish`, or `delete` inside the document cannot change the task operation, permissions, or risk route.

## Classifier

The optional classifier is a monotonic advisory hint source:

- `omp_core_classifier_prompt` builds the strict JSON classifier prompt.
- `omp_core_resolve_classification` validates the result through the route whitelist.

Configure OMP Tiny in the host config:

```yaml
modelRoles:
  tiny: opencode-go/deepseek-v4-flash:medium
```

Classifier output is a compatibility diagnostic. It cannot select the main runtime workflow, grant host permissions, remove user constraints, block tools, or trigger a repair loop. For writing diagnostics, prompt-language hints do not override observed source-text language.

## Quality tools

Quality tools return structured findings without controlling the host lifecycle:

- `writing_logic_check` and `writing_quality_check` report writing findings.
- `omp_test_gate` is retained as a compatibility name for an advisory testing review. It never executes `testCommand` or project-configured commands.
- `fact_check_gate` is retained as a compatibility name for an advisory fact-check completeness review.

A critical finding can make a report say `needs attention`; it does not block another tool call or session completion. Invalid parameters, missing files, and real execution failures still use normal error results.

Browser artifacts remain confined below the real project `.omp/testing-enhancer-artifacts` directory, and an optional server command remains limited to package-manager start/dev/serve/preview scripts. These are tool input and filesystem-safety contracts, not completion gates.

## Upgrade

Upgrade all installed marketplace plugins:

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade
```

Or upgrade selected plugins:

```bash
omp plugin upgrade omp-enhancer-core@omp-enhancer
omp plugin upgrade omp-config@omp-enhancer
omp plugin upgrade writing-helper@omp-enhancer
omp plugin upgrade omp-testing-enhancer@omp-enhancer
omp plugin upgrade omp-fact-checker@omp-enhancer
```

### Ignore historical managed gate skills

Older local OMP installations may still have six managed skills whose instructions describe the retired hard-gate workflow. Preview the exact ignored-skill merge without changing configuration:

```bash
npm run migrate:legacy-gate-skills
```

Apply it after reviewing the JSON result:

```bash
npm run migrate:legacy-gate-skills -- --apply
```

The migration only adds these exact names to `skills.ignoredSkills`:

- `gate-aware-interaction`
- `omp-factcheck-gate-satisfy`
- `omp-gate-satisfaction`
- `omp-gate-unblock`
- `omp-subagent-gate-satisfaction`
- `omp-testing-gate-report`

Apply mode backs up `config.yml`, verifies the persisted ignored list, and verifies that `autolearn.enabled` and `autolearn.autoContinue` did not change. It does not delete or overwrite managed skill directories. The same read-only findings are available from `omp_core_install_skills` diagnostics.

## Development

Run from the repository root unless noted:

```bash
npm test
npm run check:marketplace
npm run pack:all
```

Targeted checks:

```bash
cd plugins/omp-enhancer-core && npm test
cd plugins/omp-config && npm test
cd plugins/writing-helper && npm test && npm run coverage
cd plugins/omp-fact-checker && npm test
cd plugins/omp-test-enhancer && bun run typecheck && bun run build && bun run test
```

The key runtime regressions are:

- no registered plugin hook returns `block: true`;
- no registered plugin hook returns `continue: true`;
- old persisted gate/terminal state cannot revive a block;
- the main runtime exposes the full catalog and inventory while leaving skills, tools, roles, and workflow composition agent-selected;
- writing language follows source text, not instruction language.

### Installed DeepSeek workflow E2E

The installed-runtime harness invokes the real `omp` executable with `opencode-go/deepseek-v4-flash` and advisor mode. Upgrade the marketplace plugins first; this harness tests the installed copies, not merely the current worktree.

Preview the complete scenario matrix without invoking the model:

```bash
npm run e2e:deepseek -- --dry-run
```

Run one focused scenario once:

```bash
npm run e2e:deepseek -- --scenario english-review-zh-prompt --repeat 1
```

Run the full installed-runtime matrix with its configured repetitions:

```bash
npm run e2e:deepseek
```

The matrix covers English and Chinese review/polish with cross-language instructions, local fact checking, code planning/diagnosis/audit behavior, host autolearn capture, and semantic-preservation edits. Its event summarizer can verify native TODO initialization and completion, TODO-before-work ordering, task batch size, and workflow/step/TODO/skill metadata within the first 120 characters of each child assignment. It also distinguishes successful skill reads from claims, checks for duplicate failed calls and plugin-triggered continuation, snapshots editable fixtures, and verifies that autolearn settings remain stable. Raw events and the aggregate `report.json` are written below `.omp/e2e-results/<run-id>/` and are gitignored.

The autolearn scenario uses OMP RPC mode so the runner can keep the host process alive until the hidden capture turn actually finishes. Ordinary print mode may dispose the process after the primary result and abort the asynchronously scheduled capture. The evaluator rejects aborted assistant messages, process signals, and hard timeouts instead of counting those runs as successful.

## Release workflow

Preview before changing versions:

```bash
npm run release -- --plugin all --bump patch --dry-run
```

Apply a release and validate it:

```bash
npm run release -- --plugin all --bump patch --apply
npm test
npm run check:marketplace
npm run pack:all
```

The marketplace tracks GitHub `main` by default. Use `--pin-ref` only for an intentionally immutable archival release.

The implementation plan for the advisory-only redesign is in [`docs/superpowers/plans/2026-07-12-advisory-only-workflow-refactor.md`](docs/superpowers/plans/2026-07-12-advisory-only-workflow-refactor.md).

The DeepSeek workflow-compliance hardening plan is in [`docs/superpowers/plans/2026-07-12-deepseek-workflow-compliance-hardening.md`](docs/superpowers/plans/2026-07-12-deepseek-workflow-compliance-hardening.md).

The main-agent workflow orchestration redesign is in [`docs/superpowers/plans/2026-07-13-main-agent-workflow-orchestration-redesign.md`](docs/superpowers/plans/2026-07-13-main-agent-workflow-orchestration-redesign.md).
