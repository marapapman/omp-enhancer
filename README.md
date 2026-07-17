# omp-enhancer

OMP marketplace monorepo for autonomous workflow orchestration, workflow skills, writing QA, testing QA, fact checking, and packaged OMP configuration.

## Plugins

- `omp-enhancer-core`: records safe task facts, exposes opt-in compatibility diagnostics, and provides explicit extension-tool activation without replacing OMP's prompt or orchestration.
- `omp-config`: packages OMP config assets, the optional workflow-reference skill, one uniquely named target-auditor Agent, notify-only guards, opt-in hook templates, and diagnostics.
- `writing-helper`: provides writing logic, style, and citation checks plus writer/checker agents and writing skills.
- `omp-testing-enhancer`: provides `test-planner`, `test-executor`, and `test-reviewer` agents plus test target analysis, browser evidence, coverage/mutation context, advisory quality review, and reports.
- `omp-fact-checker`: provides claim extraction, evidence collection, cross-checking, reporting, and advisory completeness review.

The stack is advisory-only and OMP-native-first. Its default lifecycle handlers do not inject or replace `systemPrompt`, select workflows, force TODOs or delegation, block tool calls, prevent session completion, or start automatic repair turns. OMP's system prompt, settings, active tools, dynamically discovered Agents, sandboxing, permissions, approval prompts, and completion behavior remain authoritative.

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

Plugins remain independently installable. `omp-enhancer-core` provides opt-in diagnostics and tool activation. `omp-config` publishes optional assets, Agents, Skills, guards, and hook templates through OMP's native discovery mechanisms.

After installing or upgrading `omp-config`, you may preview and apply its managed optional context from an OMP session. With `omp-enhancer-core` loaded:

```text
Run /enhancer-tools enable config.
Call omp_config_sync_workflow_context first with apply=false, then with apply=true after reviewing the target files.
```

The sync preserves unrelated `AGENTS.md` and `WATCHDOG.yml` content. It can synchronize the generated `OMP_ENHANCER_WORKFLOW_CATALOG.md`, but the managed Main and Advisor blocks do not import that file. Main identifies `omp-enhancer-workflows` as optional reference material. Advisor additionally receives a compact evidence and send-limit policy that distinguishes Main's tools from Advisor's, consolidates material findings into at most one ordinary note per primary task by default, and suppresses late nits and concerns after a complete Main final without overriding OMP's native `blocker` delivery. OMP remains authoritative, and this guidance creates no execution or completion gate. The packaged config selects `openai-codex/gpt-5.6-luna:xhigh` for `modelRoles.advisor`. Start a new OMP session after applying context-file changes.

## OMP-native-first workflow reference

Describe the task naturally and let OMP use its built-in workflow, tool, TODO, and Agent behavior. On normal `before_agent_start` turns, Core may record JSON-safe task facts for later diagnostics, but it never returns `systemPrompt`, chooses a workflow, activates a tool, supplies or autoloads a Skill, or rewrites a child assignment.

There is one narrowly scoped compatibility message for the exact `opencode-go/deepseek-v4-flash` model. Core may append it at most once per active top-level Main task as a hidden custom hook message. The stored message carries `attribution: user`, while OMP serializes an ordinary non-Skill custom hook message as supplemental developer context; its text therefore explicitly yields to the user instruction and every native OMP contract. Its sections are independently capability-gated: when OMP exposes visible Skills, it first includes the existing Skill-discovery reminder; when OMP's native `task` tool is active and the user has not forbidden agents or delegation, it then includes a concise `DEEPSEEK_DELEGATION_HINT`. The hint asks DeepSeek to act on OMP's own scope and delegation decision instead of merely describing it, while keeping direct work inline; it does not add a plugin workflow, fixed fan-out, inspection budget, or alternate task shape. In native preferred mode, it only uses OMP's existing SHOULD-level preference as a tie-breaker after the native direct/mechanical, dependency, prerequisite, and already-enumerated rules have been applied; it does not turn that preference into a new gate or MUST.

For review-eligible `modify`, `create`, or `release` work, Core may also prepend a compact initial reviewer-width advisory. An explicit independent-review requirement may opt another operation into the same checkpoint-only calculation. The advisory is emitted only when the canonical native prompt exposes a positive numeric concurrency capacity, the user permits subagents and independent review, and the task facts produce a nonzero 0–3 suggestion. The acting model is asked to re-evaluate the initial tier only if a user-selected or native workflow reaches an existing independent-review checkpoint. Core does not run again at that checkpoint. The advisory does not create that checkpoint, TODO, stage, task, fork, batch, permission, continuation, or completion gate, and it cannot guarantee that the model will dispatch a reviewer. Unless the user explicitly requires independent review, pure execution, primary read-only audits, response-only writing, focused workspace-write-only changes, other zero-suggestion work, unknown capacity, and explicit no-review scope omit this section. A scoped prohibition on implementation delegation suppresses the generic initial fan-out hint and its implementation roles while still allowing an explicitly requested independent-review checkpoint; a global no-agent or no-delegation constraint suppresses both.

When the one canonical OMP Delegation section itself confirms batch `tasks[]` and a numeric concurrency cap $N \geq 2$, Core may append those current-turn native facts: for 2 through $N$ genuinely independent runnable slices, native width means one batch assignment per slice. The fact is omitted for flat, ambiguous, unknown, unlimited-without-a-number, or cap-one configurations; counts above $N$ remain entirely OMP's decision. If neither capability is available, no message is emitted. The hint does not invent an Agent or grant authority: OMP's current dynamic Available Agents, native `task` schema, concurrency and result-delivery instructions, user scope, verification requirements, permissions, approvals, and completion behavior remain authoritative. The message does not provide or autoload a Skill, return or replace `systemPrompt`, activate a tool, rewrite a child assignment, or create a completion gate. Other models, subagent launches, Advisor turns, and later turns in the same active task do not receive it.

For controlled A/B diagnostics, set `OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT=1` on the OMP process to suppress only this compatibility message. The Core plugin and the rest of OMP stay loaded; the default remains enabled for the exact model and capability gates above.

`omp-config` exposes the generated catalog through the optional `omp-enhancer-workflows` Skill. Load that Skill only when a domain checklist or composable workflow card would help. Its cards are reference information: the acting Agent may select, combine, simplify, or ignore them. They never grant permission or require a TODO, delegation, exact Agent, Skill load, or execution sequence.

The legacy router, classifier, status, and coverage views remain explicit compatibility diagnostics only. They do not control the normal runtime.

### Extension tool activation

All tools registered by this marketplace are `defaultInactive`. This keeps extension schemas out of the default prompt and preserves OMP's native active-tool set. When an extension tool is useful, activate only the relevant group explicitly:

```text
/enhancer-tools status
/enhancer-tools enable core
/enhancer-tools enable config
/enhancer-tools enable writing
/enhancer-tools enable fact
/enhancer-tools enable test
/enhancer-tools enable all
/enhancer-tools disable <core|config|writing|fact|test|all>
```

The command changes the current session's active extension tools only after an explicit user invocation. Tool approval classes still apply; activation is not permission to perform a write, execute a command, access the network, or publish anything.

`autoContinue: false` describes Core's own lifecycle behavior; it does not disable or rewrite the host's autolearn settings. When the host emits an `autolearn-nudge` capture turn, Core does not route it as a new user task, inject another workflow, or schedule a follow-up. Host-owned `autolearn.enabled` and `autolearn.autoContinue` therefore remain available while Core itself never returns `continue: true`.

### How the optional catalog is used

There is no automatic keyword-to-route switch. OMP discovers `omp-enhancer-workflows` as a normal Skill and decides how Skills are presented and loaded. If the acting Agent chooses to consult it, the Skill provides a compact index and domain-specific reference files. Otherwise the task proceeds entirely through OMP's native behavior.

The generated [`plugins/omp-config/assets/WORKFLOW_CATALOG.md`](plugins/omp-config/assets/WORKFLOW_CATALOG.md) remains available for explicit configuration synchronization and human inspection. Managed `AGENTS.md` and `WATCHDOG.yml` blocks do not import it automatically, so installing or syncing the plugin does not append the full catalog to Main or Advisor system context.

OMP's dynamic Available Agents list is the source of truth at assignment time. `designer`, `librarian`, and `reviewer` are OMP-native Agents; `omp-config` does not shadow them. The config plugin contributes only the uniquely named `omp-target-auditor` for a bounded read-only target audit. Other plugins retain their specialized, uniquely named Agents. Catalog role names are optional candidates and must be ignored when unavailable.

Selection is semantic rather than lexical. A word such as `publish` inside a document does not activate a release workflow, and an English instruction does not select English-writing skills when the target text is Chinese. User constraints and host permissions remain in force regardless of the selected workflow.

You can optionally name workflow IDs in the request when you want to constrain the plan, for example, `Use code.review + security.review and do not modify files`. Naming a workflow is reference guidance to the acting Agent; it is not permission for writes, network access, release, or another side effect.

### OMP 17 Skill discovery and the ECC catalog

OMP 17 directly discovers only immediate children shaped like `<plugin>/skills/<skill>/SKILL.md`. It does not register every deeper `SKILL.md` as a separate prompt-visible Skill. Therefore [`plugins/omp-config/skills/ecc/SKILL.md`](plugins/omp-config/skills/ecc/SKILL.md) appears as the single top-level `ecc-skill-catalog` Skill, while its 255 nested ECC guides remain on-demand resources instead of 255 permanent system-prompt entries.

Use the adapter progressively: inspect OMP's directly visible Skills first; if none adequately matches a niche task, read `skill://ecc-skill-catalog/catalog.md`; then read only the exact guide URI listed there, for example `skill://ecc-skill-catalog/python-testing/SKILL.md`. Do not bulk-load the catalog or guess nested names.

The marketplace `skills` array intentionally remains a recursive filesystem inventory, including nested ECC paths. Repository validation and the explicitly invoked `omp_core_install_skills` compatibility installer consume that inventory, but its presence does not mean OMP 17 directly registers every nested guide during normal plugin discovery.

### Available workflow catalog

Catalog version: **12**. Candidate Skills, Agents, steps, quality checks, scope notes, risks, and delegation ideas are optional recommendations, not runtime requirements. The acting Agent should use only candidates currently available through OMP and useful for the task. The structured definitions under [`plugins/omp-enhancer-core/src/workflows/definitions`](plugins/omp-enhancer-core/src/workflows/definitions) are the single semantic source. `npm run generate:workflows` renders both the packaged catalog asset and the `omp-enhancer-workflows` Skill with domain references; `npm run check:workflows` rejects drift. Version 12 deliberately has no healthcare workflow; healthcare-related Skills remain optional knowledge overlays for an ordinary research, security, fact-checking, or review workflow.

See [`docs/WORKFLOW_DEVELOPMENT.md`](docs/WORKFLOW_DEVELOPMENT.md) for the definition schema, Agent/Skill ownership rules, generation commands, validation matrix, and release impact of adding or changing a workflow.

For example, the catalog may suggest `zh-writer` and `zh-checker` for resolved Chinese writing, `writer` and `checker` for resolved English writing, or `test-planner`, `test-executor`, and `test-reviewer` for testing. These remain optional candidates; OMP's current Agent inventory and the acting Agent's judgment decide whether any delegation occurs.

Document and general workflows:

| Workflow | Optional reference signal | Typical Skill candidates |
| --- | --- | --- |
| `agentic.simple` | A bounded request needs no specialized process. | No default; use an exact active skill only when useful. |
| `writing.pending` | Writing intent is clear, but the body of the target text has not been observed. | No language-specific skill until the target body is read. |
| `writing.zh` | The prose being drafted or changed is Chinese, regardless of instruction language. | `plain-chinese-writing`, `zh-writing-review`, `zh-writing-polish`, `zh-writing-checkers` |
| `writing.en` | The prose being drafted or changed is English, regardless of instruction language. | `writing-review`, `writing-checkers`, `writing-markdown-helper` |
| `writing.latex` | The artifact is LaTeX. Compose it with a language workflow for prose changes. | `format-markdown2latex`, `format-latex2markdown`, `format-template-latex` |
| `slides.generate` | A new LaTeX Beamer deck needs template validation, a confirmed story outline, designer layout, and independent visioner review. | `latex-beamer-slides`, `slides-storyline`, optional `beamer-to-powerpoint` |
| `slides.modify` | An existing Beamer deck needs bounded wording or style changes plus designer/visioner QA of affected pages. | `latex-beamer-slides` plus the source-language writing skills |
| `diagram.svg` | A workflow, process, block, or box diagram needs strict monochrome SVG geometry plus iterative rendered review. | `svg-flowchart` with `designer` creation and `visioner` review |
| `writing.markdown` | The artifact is Markdown. Compose it with a language workflow for prose changes. | `writing-markdown-helper`, `zh-writing-markdown-helper` |
| `doc.convert.word` | The task creates, edits, or converts a Word document. | `docx` |
| `research.web` | The task requires current online research, reliable source selection, synthesis, and claim-level fact checking. | `research-ops`, `deep-research`, plus the fact-checking skill set |
| `factcheck.document` | The user asks to verify claims, citations, chronology, freshness, or source support. | `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity` |
| `research.technical` | A technical answer depends on the exact installed or current library, SDK, API, signature, or version. | `documentation-lookup`, source evaluation, and citation checks |

Engineering and delivery workflows:

| Workflow | Optional reference signal | Typical Skill candidates |
| --- | --- | --- |
| `code.plan` | The requested deliverable is an implementation, repair, migration, or test plan, not the change itself. | `brainstorming`, `writing-plans` |
| `code.dev` | The user asks for code or configuration changes. | `brainstorming`, `test-driven-development`, `subagent-driven-development`, `verification-before-completion` |
| `code.debug` | A concrete failure, regression, or mismatch must be reproduced, localized, or explained. | `diagnose`, `systematic-debugging` |
| `code.test` | The task is to design, add, run, or interpret tests through planning, bounded execution, and independent review. | `test-driven-development`, `verification-before-completion` |
| `code.review` | The requested result is a read-only code review, bug audit, architecture review, or regression audit. | `diagnose`, `verification-before-completion`, an applicable language or framework reviewer |
| `code.build` | A compiler, linker, package, SDK, code-generation, or bundler failure needs evidence-led diagnosis and an authorized repair. | `build-toolchain-diagnostics`, `systematic-debugging`, language-specific patterns |
| `performance.optimize` | A measured bottleneck needs profiling, a bounded change, and like-for-like before/after evidence. | `benchmark`, `benchmark-optimization-loop`, relevant runtime patterns |
| `network.design` | A network topology, addressing, routing, segmentation, or resilience design is requested without applying configuration. | `network-config-validation`, applicable vendor patterns, `safety-guard` |
| `network.homelab` | A home-lab network needs a bounded readiness or topology plan. | `homelab-network-readiness`, `homelab-network-setup`, applicable DNS/VLAN/VPN skills |
| `network.review` | Existing network configuration needs an independent read-only review. | `network-config-validation`, vendor patterns, `safety-guard` |
| `network.debug` | A concrete connectivity, route, interface, BGP, DNS, VPN, or device-state failure needs localization. | `network-interface-health`, `network-bgp-diagnostics`, `systematic-debugging` |
| `database.review` | Schema, query, transaction, index, or migration behavior needs a read-only database-aware review. | `database-migrations`, an applicable database pattern skill, `verification-before-completion` |
| `database.change` | An authorized schema, query, persistence, or transaction change needs plan, implementation, tests, and independent review. | `database-migrations`, database patterns, TDD and safety skills |
| `database.migration.repair` | A failed or unsafe migration needs current-state diagnosis, backup and rollback planning, repair, and verification. | `database-migrations`, `postgres-patterns`, `systematic-debugging`, `safety-guard` |
| `ml.review` | An ML system needs a read-only audit of data contracts, leakage, reproducibility, evaluation, serving, and operations. | `mle-workflow`, relevant framework patterns, `verification-before-completion` |
| `ml.debug` | An ML data, training, evaluation, artifact, or serving failure needs evidence-led diagnosis and an authorized repair. | `mle-workflow`, `systematic-debugging`, framework patterns and TDD |
| `marketing.campaign` | A campaign needs reliable market evidence, fact-checked claims, language-aware writing, and optional visual design. | `marketing-campaign`, `market-research`, `brand-voice` |
| `seo.audit` | A site needs evidence-based crawl, indexability, rendering, content, structured-data, or performance analysis without implicit repair. | `seo`, `benchmark`, frontend and accessibility skills |
| `omp.plugin` | An OMP plugin, marketplace entry, packaged skill, hook, agent, template, install, or upgrade is in scope. | `omp-marketplace-plugin-activation`, an applicable plugin- or skill-authoring skill |
| `security.review` | The user explicitly requests review of security boundaries, vulnerabilities, impact, or remediation. | `security-review`, `security-scan` |
| `design.visual` | The deliverable is a UI, visual asset, diagram, layout, or interaction design. | `frontend-design`, `canvas-design`, or another medium-specific visual skill |
| `release.opensource` | A private project must be prepared in a separate staging copy, independently sanitized, packaged, and reviewed before any optional publication. | `opensource-pipeline`, `security-review`, `verification-before-completion` |
| `release.publish` | The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact. | `conventional-commits`, `finishing-a-development-branch`, `verification-before-completion` |

### Composition examples

The workflows are designed to compose; selecting one does not exclude another:

- `Polish tex/introduction.tex` starts as `writing.pending` when only the path is known. After reading an English body, the main agent composes `writing.en + writing.latex`, delegates the prose revision to `writer`, delegates independent review to `checker`, and loads the smallest applicable English-review and LaTeX skills.
- `Create a Beamer lecture deck` selects `slides.generate`. It validates or discusses the template first, confirms a numbered story outline and output language, then uses `designer` for final layout and `visioner` for independent review of fresh page renders before any user-command PowerPoint conversion.
- `Tighten the wording on slides/012-example.tex` starts from the target body language and composes `slides.modify + writing.zh|writing.en + writing.latex`; it preserves the existing template and story while `designer` and `visioner` check only changed or layout-affected pages.
- `Create a black-and-white SVG workflow diagram` selects `diagram.svg + design.visual`. A `designer` owns the source and revisions, a read-only `visioner` checks fresh full-size and reduced renders, and material findings trigger a bounded relayout cycle.
- `Research the current market and produce a cited Chinese report` composes `research.web + factcheck.document + writing.zh`. Independent evidence lanes prioritize claim-appropriate primary sources, the cross-checker classifies agreement, conflicts, and temporal-staleness findings without inventing resolution, and unsupported conclusions are excluded or labeled uncertain.
- `Review this Chinese chapter for logic and citations` composes `writing.zh + factcheck.document`; the Chinese body, not the English wording of a possible instruction, determines the writing workflow.
- `Find the crash, fix it, and add regression tests` commonly composes `code.debug + code.dev + code.test`; the testing phase uses `test-planner`, `test-executor`, and an independent `test-reviewer` while production changes remain in `code.dev`.
- `Audit the authentication code but do not modify anything` commonly composes `code.review + security.review`; the no-write constraint prevents `code.dev` work even if remediation ideas are reported.
- `Update this OMP plugin, run its tests, commit, push, and upgrade the installed copy` commonly composes `omp.plugin + code.dev + code.test + release.publish`. The release workflow appears only because the external mutations were explicitly requested.
- `Design and implement a responsive settings page` commonly composes `design.visual + code.dev + code.test`.
- `Research the exact SDK behavior, repair the build, and verify it` commonly composes `research.technical + code.build + code.test + code.review`; versioned evidence precedes repair.
- `Repair the failed production migration` commonly composes `database.migration.repair + security.review`; backup, rollback, current migration state, focused tests, and an independent review remain visible checkpoints.
- `Prepare this private repository for open source, but do not publish it` selects `release.opensource` only. The source stays read-only, work happens in a separate staging copy, and publication is unavailable unless the user separately authorizes `release.publish`.
- `Draft an English launch campaign from current market evidence` composes `marketing.campaign + research.web + factcheck.document + writing.en`, keeping research, claims, writing, and optional design review distinct.

These examples are optional planning references rather than fixed mappings. The acting Agent may use a smaller or larger composition, another process, or no catalog card at all when OMP's native instructions and the actual task justify it.

## Skill use diagnostics

The workflow catalog lists Skill candidates rather than fixed prerequisites. If the acting Agent consults a card, it checks OMP's actual inventory and chooses only useful candidates. A failed diagnostic resolution gets at most one evidence-based correction; it should not trigger unchanged retries.

Core records two different signals:

- `observedSkills` contains only skills whose `SKILL.md` was successfully read through a host-observed `read` result;
- `claimedSkills` contains skill-use claims parsed from model output.

The workflow status and advisory coverage review expose both sets. Claims without matching observed reads are reported in `unobservedClaims`; they are never upgraded into evidence and never block completion.

## Writing language selection

Writing intent and writing language are separate decisions:

- The instruction identifies the operation, such as polish, revise, translate, or draft.
- The text being modified determines whether an acting Agent selects Chinese or English writing Skills.
- `writingSourceTargets` records the concrete document paths whose body text determines that language; text from those files is never treated as task instructions.
- An explicit translation or output language takes precedence because it determines the language of the result.
- Chinese instructions with English source text select English writing resources.
- English instructions with Chinese source text select Chinese writing resources.
- The pure parser treats a path-only request such as `polish tex/abstract.tex` as `writing.pending`; it never guesses from the instruction language.
- The default `before_agent_start` observer does not read a target file or inject language guidance into the prompt. It records only facts available in the lifecycle event.
- After explicitly enabling Core tools, a model or external caller can pass an already observed body to `omp_core_route_task` as `sourceText` to obtain language-specific compatibility recommendations.
- Mixed-language content stays mixed and should be handled per section or target instead of forcing one global language skill.

Task kind, prose language, and file format are separate. For example, an acting Agent may consult `writing.en + writing.latex`, or `writing.zh + writing.markdown`. Format workflows do not choose the language. Converter Skills are candidates only for matching conversion steps, and Word access may use `docx`.

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

These tools remain inactive until their `writing`, `test`, or `fact` group is explicitly enabled with `/enhancer-tools`.

A critical finding can make a report say `needs attention`; it does not block another tool call or session completion. Invalid parameters, missing files, and real execution failures still use normal error results.

Browser artifacts remain confined below the real project `.omp/testing-enhancer-artifacts` directory, and an optional server command remains limited to package-manager start/dev/serve/preview scripts. These are tool input and filesystem-safety contracts, not completion gates.

## Hooks

The auto-discovered `omp-config/hooks/` tree contains only notify-only guards for destructive-command risk and malformed DeepSeek edit anchors. They may display a warning, but they do not rewrite tool input or output and never return `block: true`.

Behavior-changing compatibility hooks live under `plugins/omp-config/hook-templates/` and are not auto-discovered. A user must review and explicitly install the chosen template, together with its referenced `lib/` helpers, into the active OMP hook configuration. The bundled templates are gated to provider `opencode-go` and model IDs `deepseek-v4-flash` or `deepseek-v4-pro`. The optional post-hook uses one ordered pipeline so formatting, secret redaction, and truncation do not compete to replace the same result; it preserves non-text content blocks, `details`, and `isError`. These templates remain compatibility aids, not permission or completion controls.

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
npm run generate:ecc-skills
npm run check:ecc-skills
npm run check:marketplace
npm run pack:all
```

`generate:ecc-skills` rebuilds `plugins/omp-config/skills/ecc/SKILL.md` and `plugins/omp-config/skills/ecc/catalog.md` from the nested guides; `check:ecc-skills` fails when either generated adapter artifact has drifted.

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
- default lifecycle hooks never return `systemPrompt`; only an exact `opencode-go/deepseek-v4-flash` top-level Main task can receive the single hidden capability-gated message described above, with Skill discovery only when Skills are visible and the native-policy delegation hint only when `task` is active and subagents are allowed;
- extension tools remain inactive until `/enhancer-tools enable <group|all>` is explicitly invoked;
- the optional workflow Skill is discoverable without importing the full catalog into `AGENTS.md` or `WATCHDOG.yml`;
- OMP 17 sees `ecc-skill-catalog` as one top-level Skill and resolves its nested guides only through exact on-demand URIs;
- OMP's native `designer`, `librarian`, and `reviewer` Agents are not shadowed by `omp-config`;
- writing language follows source text, not instruction language.

Run the isolated OMP 17 RPC contract probe against the host alone or the current worktree:

```bash
node scripts/e2e/omp17-rpc-probe.mjs --
node scripts/e2e/omp17-rpc-probe.mjs -- \
  -e plugins/omp-enhancer-core/index.js --plugin-dir plugins/omp-enhancer-core \
  -e plugins/omp-config/index.js --plugin-dir plugins/omp-config \
  -e plugins/writing-helper/index.js --plugin-dir plugins/writing-helper \
  -e plugins/omp-test-enhancer/src/extension.ts --plugin-dir plugins/omp-test-enhancer \
  -e plugins/omp-fact-checker/index.js --plugin-dir plugins/omp-fact-checker
```

The probe reports hashes and structural booleans instead of dumping prompts or secrets. It isolates OMP's home and agent directories, so the first command is a clean native baseline. Do not combine `--no-extensions` with `-e` or `--plugin-dir`: OMP disables the explicit worktree extensions too. Use the two outputs to compare the static startup prompt, active built-in tools, dynamic native Agents, optional Skill visibility, catalog-import count, and enhancer commands. The default probe does not submit a prompt, so it proves that the compatibility message is absent from startup `systemPrompt` and the native `task` schema; hook unit tests and the live DeepSeek matrices verify the capability-gated runtime message separately.

After linking or upgrading the plugins, inspect the actual local OMP installation without invoking a model:

```bash
OMP_RPC_USE_HOST_INSTALLATION=1 node scripts/e2e/omp17-rpc-probe.mjs --
```

Host-installation mode loads the current OMP home and managed context, but still uses `--no-session` and emits only the same hashes and structural booleans.

### Installed DeepSeek workflow E2E

The installed-runtime harness invokes the real `omp` executable with `opencode-go/deepseek-v4-flash` and isolated per-scenario configuration; Advisor is off unless a scenario explicitly enables it. Upgrade the marketplace plugins first; this harness tests the installed copies, not merely the current worktree.

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

If the host wall clock is known to jump during a recovery run, pass `--no-omp-deadline` to the underlying runner. This omits OMP's wall-clock `--max-time` while preserving the runner's independent hard timeout and monotonic duration measurement. It is a recovery option, not an automatic retry for provider or socket failures.

Run the focused natural-language Skill-discovery matrix:

```bash
npm run e2e:deepseek:skills
```

This matrix never names a Skill or `skill://` URI in its user prompts. It requires successful observed reads separately from provided/autoload evidence, covers plugin Skills, OMP/user Skills, the on-demand ECC nested catalog, a native subagent control, and a zero-Skill negative control.

Run the natural-language subagent-willingness matrix:

```bash
npm run e2e:deepseek:subagents
```

Its positive prompts do not mention `task`, subagents, forks, or delegation. The matrix keeps `task.eager: preferred`, exposes OMP's native `task` and `hub` together, separates assignment attempts from accepted and completed jobs, and records parent inspections before the first task call and after child results arrive. The two-file case gives each file a substantive independent boundary audit and allows at most two assignments; the explicitly named five-plugin case allows OMP to choose up to five rather than encoding a two-way fan-out in the hint. These are scenario-local evaluator bounds, not runtime policy. Negative controls cover one target, two trivial lookups, and an explicit main-only user constraint that does not use the word `subagent`. Task calls remain observed model choices rather than plugin completion permissions.

The matrix covers English and Chinese review/polish with cross-language instructions, local fact checking, code planning/diagnosis/audit behavior, host autolearn capture, and semantic-preservation edits. Interpret TODO, task, Skill, and Agent events as observations of OMP's own choices, not requirements imposed by this plugin. It also distinguishes successful Skill reads from claims, checks for duplicate failed calls and plugin-triggered continuation, snapshots editable fixtures, and verifies that autolearn settings remain stable. Raw events and the aggregate `report.json` are written below `.omp/e2e-results/<run-id>/` and are gitignored.

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
npm run check:ecc-skills
npm run check:marketplace
npm run pack:all
```

The marketplace tracks GitHub `main` by default. Use `--pin-ref` only for an intentionally immutable archival release.

The implementation plan for the advisory-only redesign is in [`docs/superpowers/plans/2026-07-12-advisory-only-workflow-refactor.md`](docs/superpowers/plans/2026-07-12-advisory-only-workflow-refactor.md).

The DeepSeek workflow-compliance hardening plan is in [`docs/superpowers/plans/2026-07-12-deepseek-workflow-compliance-hardening.md`](docs/superpowers/plans/2026-07-12-deepseek-workflow-compliance-hardening.md).

The main-agent workflow orchestration redesign is in [`docs/superpowers/plans/2026-07-13-main-agent-workflow-orchestration-redesign.md`](docs/superpowers/plans/2026-07-13-main-agent-workflow-orchestration-redesign.md).
