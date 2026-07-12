# omp-enhancer

OMP marketplace monorepo for advisory task routing, workflow skills, writing QA, testing QA, fact checking, and packaged OMP configuration.

## Plugins

- `omp-enhancer-core`: compiles natural-language tasks into an advisory route plan and injects suggested skills, roles, steps, quality checks, and risk notes.
- `omp-config`: packages OMP config assets, agents, skills, non-blocking hooks, templates, and diagnostics.
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

Plugins remain independently installable. `omp-enhancer-core` is needed only for automatic natural-language routing and workflow guidance.

## Advisory routing

After installing `omp-enhancer-core`, describe the task naturally. The core plugin builds a `TaskDescriptor`, then compiles a RoutePlan with:

- `steps`: a suggested task sequence;
- `skills`: skills worth loading for the acting agent;
- `tools`: optional workflow tools;
- `roles`: optional subagent roles;
- `qualityChecks`: checks to consider before making completion claims;
- `riskNotes`: risks and host-permission boundaries to keep visible;
- `mode: "advisory"` and `autoContinue: false`.

Route constraints describe the user's requested scope. They are not plugin-generated authorization tokens. A wrong route can therefore produce a poor recommendation, but it cannot return `block: true`, stop an edit, or force another model turn.

The runtime behavior is deliberately small:

1. `before_agent_start` injects route and workflow guidance.
2. `tool_call` may attach advisory skill and role context to delegated tasks; it never refuses the call.
3. `tool_result` records optional skill and task diagnostics.
4. `session_stop` persists advisory state and always allows the session to finish. Core does not register generated-output loop control.

Missing skills or workflow tools should be reported as limitations while the agent continues with the best available method. `SKILL_USAGE`, `SUBAGENT_USAGE`, and structured QA blocks are optional diagnostic summaries, not completion permits.

`autoContinue: false` describes Core's own lifecycle behavior; it does not disable or rewrite the host's autolearn settings. When the host emits an `autolearn-nudge` capture turn, Core does not route it as a new user task, inject another workflow, or schedule a follow-up. Host-owned `autolearn.enabled` and `autolearn.autoContinue` therefore remain available while Core itself never returns `continue: true`.

## Planning routes

Implementation and test-planning requests use the public `planning` intent and the compatibility workflow name `code.plan`. This keeps planning distinct from `code.dev`: the route suggests inspecting the relevant implementation and test context, defining scope and invariants, and returning an actionable verification strategy without implying that files should be edited or tests should be run.

The primary planning skills are `brainstorming` and `writing-plans`. A test-focused plan may also suggest `ai-regression-testing`, even when the requested scope explicitly excludes test execution. All three are workflow guidance, not prerequisites for answering and not execution permissions.

## Skill use diagnostics

Workflow guidance asks the agent to read exactly the smallest directly applicable primary skill once. Resolution priority is an exact project-specified skill, then the exact routed URI, then one inventory-confirmed equivalent. A failed resolution gets at most one evidence-based correction; the agent then continues with the available method instead of retrying unchanged calls.

Core records two different signals:

- `observedSkills` contains only skills whose `SKILL.md` was successfully read through a host-observed `read` result;
- `claimedSkills` contains skill-use claims parsed from model output.

The workflow status and advisory coverage review expose both sets. Claims without matching observed reads are reported in `unobservedClaims`; they are never upgraded into evidence and never block completion.

## Writing language selection

Writing intent and writing language are separate decisions:

- The instruction identifies the operation, such as polish, revise, translate, or draft.
- The text being modified determines whether Chinese or English writing skills are suggested.
- `writingSourceTargets` records the concrete document paths whose body text determines that language; text from those files is never treated as task instructions.
- An explicit translation or output language takes precedence because it determines the language of the result.
- Chinese instructions with English source text select English writing resources.
- English instructions with Chinese source text select Chinese writing resources.
- The pure parser treats a path-only request such as `polish tex/abstract.tex` as `writing.pending`; it never guesses from the instruction language.
- During `before_agent_start`, core safely reads an existing regular target file inside the workspace and refines the route from its body before injecting guidance. Unavailable, oversized, binary, escaping, or mixed-language targets remain pending.
- A model or external caller can also pass the observed body to `omp_core_route_task` as `sourceText` to obtain the same language-specific recommendations.
- Mixed-language content stays mixed and should be handled per section or target instead of forcing one global language skill.

Task kind and file format are also kept separate. English review selects `writing-review`, English polish selects `writing-markdown-helper`, Chinese review selects `plain-chinese-writing` plus `zh-writing-review`, and Chinese polish selects `plain-chinese-writing` plus `zh-writing-polish`. A `.tex` or Markdown review/polish may use the corresponding document workflow, but it does not load `format-markdown2latex`, `format-latex2markdown`, or `format-template-latex`. Those converter skills are suggested only for an explicit conversion task; Word review may still use `docx` for document access.

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

Invalid or unavailable classifier output falls back to deterministic routing. Classifier output cannot grant host permissions, remove user constraints, block tools, or trigger a repair loop. For writing tasks, prompt-language classifier hints do not override the observed source-text language.

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
- route guidance still selects useful skills, tools, roles, and workflow steps;
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

The matrix covers English and Chinese review/polish with cross-language instructions, local fact checking, code planning/diagnosis/audit behavior, host autolearn capture, and semantic-preservation edits. It distinguishes successful skill reads from model claims, checks for duplicate failed calls and plugin-triggered continuation, snapshots editable fixtures, and verifies that autolearn settings remain stable. Raw events and the aggregate `report.json` are written below `.omp/e2e-results/<run-id>/` and are gitignored.

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
