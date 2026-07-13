<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->
# OMP Enhancer Workflow Catalog

OMP_WORKFLOW_CATALOG_VERSION: 3

This catalog is shared by the main agent and Advisor. It is guidance, not a router, permission system, completion gate, or continuation controller. The acting agent chooses and may compose workflows from the observed task, target content, user constraints, and active skill inventory.

## Main-agent orchestration protocol

For every non-trivial task:

1. Read the request and the smallest context needed to understand the target.
2. Select one or more workflows below. Treat format workflows as companions when appropriate.
3. Inspect the active skill inventory and choose the smallest applicable skill set. Do not assume a listed candidate is installed.
4. Initialize the native `todo` before substantive project work and make it the first tool call. Do not read, glob, grep, edit, or otherwise inspect the project first. Include the selected workflow, required steps, selected skills, explicit user requirements, verification, and final reconciliation.
5. After TODO initialization and before project reads, load each selected installed skill with `read` path `skill://<exact-name>`. A native `skill-prompt` body already in context also counts. `manage_skill`, `learn`, memory, and a verbal claim do not load installed skills.
6. Execute TODO items in dependency order and update their status as evidence arrives. Do not rely on memory to retain unfinished requirements.
7. When at least two useful workstreams are independent, fork multiple subagents, preferably in one `task.tasks[]` batch. Keep integration, irreversible choices, and final verification with the parent. Do not fork ceremonial work for a trivial or tightly coupled task.
8. Give every child its workflow, exact workflow step, TODO item, selected skills, scope, non-goals, dependencies, deliverable, and acceptance evidence. Begin with the literal `[workflow=<ids> step=<step-id> todo=<exact-item> skills=<comma-separated-skill-names>]` prefix; do not abbreviate or rename those keys. A child owns only that checkpoint.
9. Consume the child results returned by `task`; do not launch extra subagents merely to poll other children or check temporary report files.
10. Reconcile the TODO, child results, and verification before the final response.

If `todo`, `task`, or a selected skill is unavailable, continue with a concise checklist or direct work and report a material limitation. Missing workflow mechanics are findings, never authorization or completion gates. The host alone owns sandboxing and approval.

Writing intent comes from the user instruction. Chinese or English writing resources come from the body of the text being modified, never from the prompt language. For a path-only writing request, read the target first and use `writing.pending` until the body language is observed. LaTeX, Markdown, and Word are format companions and do not choose the prose language.

## Workflow cards

### `agentic.simple`

- Select when: the request is bounded and no specialized workflow is useful.
- Steps: (1) understand the outcome and inspect minimal context; (2) perform the requested work; (3) verify proportionally and respond.
- Skill candidates: none by default; inspect the active inventory for an exact match.
- Quality checks: requested outcome, scope, and factual consistency.
- Delegation: usually direct; fork only when the request contains independent workstreams.

### `writing.pending`

- Select when: writing intent is clear but the exact source text has not been read.
- Steps: (1) read the exact text or document section; (2) detect its body language; (3) compose `writing.zh` or `writing.en` with any format companion; (4) revise and review.
- Skill candidates: no language-specific skill until the body is observed.
- Quality checks: preserve meaning, anchors, markup, and document structure.
- Delegation: for broad documents, separate bounded section review, citation checks, or consistency review after language detection.

### `writing.zh`

- Select when: the text being drafted or modified is primarily Chinese.
- Steps: (1) establish meaning and preservation constraints; (2) draft or revise natural Chinese prose; (3) review logic, tone, terminology, and readability; (4) apply requested fixes.
- Skill candidates: `plain-chinese-writing`, `zh-writing-review`, `zh-writing-polish`, and `zh-writing-checkers` when available and relevant.
- Quality checks: meaning preservation, Chinese logic and style, terminology consistency, and requested format.
- Delegation: assign independent sections or a separate logic/style review; keep final voice consistency with the parent.

### `writing.en`

- Select when: the text being drafted or modified is primarily English.
- Steps: (1) establish meaning and preservation constraints; (2) draft or revise the English prose; (3) review logic, tone, terminology, formatting, and readability; (4) apply requested fixes.
- Skill candidates: `writing-review`, `writing-checkers`, and `writing-markdown-helper` when available and relevant.
- Quality checks: meaning preservation, English logic and style, terminology consistency, and requested venue or format.
- Delegation: assign independent sections or a separate logic/style review; keep final voice consistency with the parent.

### `writing.latex`

- Select when: the target is LaTeX; compose with `writing.zh` or `writing.en` for prose work.
- Steps: (1) read the relevant source and local macros; (2) preserve commands, comments, citations, math, labels, and revision markers; (3) make the requested change; (4) inspect the diff and compile when in scope.
- Skill candidates: `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`, plus the selected language skills.
- Quality checks: LaTeX structure, active-text boundaries, reference integrity, and compile evidence when requested.
- Delegation: split independent sections, bibliography inspection, and compilation checks; avoid concurrent edits to the same source span.

### `writing.markdown`

- Select when: the target is Markdown; compose with `writing.zh` or `writing.en` for prose work.
- Steps: (1) read the source and local conventions; (2) make the requested revision or conversion; (3) review headings, lists, links, citations, and code fences; (4) render or verify when in scope.
- Skill candidates: `writing-markdown-helper` or `zh-writing-markdown-helper`, selected from source language.
- Quality checks: Markdown structure, link and fence integrity, and consistent prose.
- Delegation: split independent sections or rendering review while the parent reconciles structure.

### `doc.convert.word`

- Select when: a Word document must be created, edited, or converted.
- Steps: (1) inspect source and target format; (2) confirm output location and preservation needs; (3) create or convert; (4) review headings, tables, figures, and document structure.
- Skill candidates: `docx`.
- Quality checks: source fidelity, target readability, output existence, and overwrite awareness.
- Delegation: separate source extraction, conversion, and visual review when independent.

### `factcheck.document`

- Select when: the user asks to verify claims, citations, chronology, or factual accuracy.
- Steps: (1) extract checkable claims; (2) collect relevant independent evidence; (3) cross-check conflicts and dates; (4) report support, contradiction, staleness, or insufficiency; (5) revise only when authorized.
- Skill candidates: `fact-checking`, `claim-extraction`, `source-evaluation`, and `citation-authenticity`.
- Quality checks: claim-to-evidence correspondence, source quality, temporal validity, and clear uncertainty.
- Delegation: fork independent claim or source groups and a cross-checker; the parent resolves conflicts.

### `code.plan`

- Select when: the requested deliverable is a plan rather than implementation.
- Steps: (1) inspect minimal implementation and test context; (2) define scope and invariants; (3) decompose implementation and verification; (4) record dependencies and risks; (5) deliver an actionable plan without executing it.
- Skill candidates: `brainstorming`, `writing-plans`.
- Quality checks: scope completeness, dependency order, and verification correspondence.
- Delegation: fork architecture, test-strategy, or impact analysis when they are independent.

### `code.dev`

- Select when: code or configuration changes are requested.
- Steps: (1) inspect affected code, tests, and conventions; (2) plan the smallest coherent change; (3) write or update focused tests where appropriate; (4) implement; (5) verify and review the semantic diff.
- Skill candidates: `brainstorming`, `test-driven-development`, `subagent-driven-development`, and `verification-before-completion`.
- Quality checks: focused tests, behavior preservation, semantic diff review, and user-scope compliance.
- Delegation: fork independent discovery, implementation, tests, and review work; coordinate before editing shared files.

### `code.debug`

- Select when: a failure, regression, or unexpected behavior must be diagnosed.
- Steps: (1) reproduce or localize the failure; (2) trace the concrete path and runtime truth; (3) form and test hypotheses; (4) explain the root cause with evidence; (5) compose `code.dev` only when a fix is requested.
- Skill candidates: `diagnose`, `systematic-debugging`.
- Quality checks: reproducible evidence, cause rather than symptom, and installed-versus-source consistency.
- Delegation: fork independent log/runtime, source-path, and regression-test investigations.

### `code.test`

- Select when: the user asks to run, add, assess, or report tests.
- Steps: (1) identify targets and real project commands; (2) prepare needed fixtures or context; (3) run the relevant tests; (4) interpret host-observed output; (5) report failures and coverage honestly.
- Skill candidates: language- or framework-specific testing skills plus `verification-before-completion` when applicable.
- Quality checks: command-to-target correspondence, non-empty execution, exit status, and failure visibility.
- Delegation: run independent test groups or evidence analysis in parallel when resource-safe.

### `code.review`

- Select when: the requested deliverable is a code, bug, architecture, or regression-risk review.
- Steps: (1) inspect requested paths and surrounding contracts; (2) trace concrete callers and failure paths; (3) validate findings against tests or runtime evidence; (4) report prioritized findings with file and symbol evidence.
- Skill candidates: `diagnose`, `verification-before-completion`, and an exact language or framework reviewer skill.
- Quality checks: finding-to-code evidence, severity rationale, regression impact, and explicit hypotheses.
- Delegation: fork independent subsystems or a separate evidence reviewer; deduplicate findings before final.

### `omp.plugin`

- Select when: an OMP plugin, marketplace entry, packaged skill, hook, template, install, or upgrade is in scope.
- Steps: (1) inventory plugin assets and live installed state; (2) make the requested change; (3) run targeted tests and package checks; (4) verify marketplace consistency; (5) release, sync, or upgrade only when requested.
- Skill candidates: `omp-marketplace-plugin-activation` and the applicable skill-authoring or plugin-authoring skill.
- Quality checks: package contents, marketplace metadata, installed-runtime parity, and advisory-only lifecycle behavior.
- Delegation: fork independent runtime, config/package, and E2E reviews while the parent integrates and releases.

### `security.review`

- Select when: concrete code, configuration, or trust boundaries require security review.
- Steps: (1) identify assets, actors, boundaries, callers, and sinks; (2) inspect concrete paths; (3) distinguish demonstrated impact from hypotheses; (4) report evidence, severity, and remediation; (5) independently review high-impact findings.
- Skill candidates: `security-review`, `security-scan`.
- Quality checks: caller-to-sink evidence, exploit preconditions, impact, and remediation feasibility.
- Delegation: fork independent surfaces and a cross-reviewer; do not expose or mutate sensitive systems merely to prove a concern.

### `design.visual`

- Select when: visual hierarchy, interface design, layout, graphics, or interaction states are the deliverable.
- Steps: (1) inspect existing visual context and constraints; (2) choose a direction; (3) create or refine the design; (4) review hierarchy, spacing, typography, responsiveness, accessibility, and states; (5) verify in the relevant renderer.
- Skill candidates: `frontend-design`, `canvas-design`, or another exact visual skill matching the output medium.
- Quality checks: visual coherence, responsive behavior, accessibility, and rendered evidence.
- Delegation: split independent asset research, implementation, and visual QA; keep one parent-owned design direction.

### `release.publish`

- Select when: the user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.
- Steps: (1) confirm the requested target and release scope; (2) run relevant preflight checks; (3) perform the requested mutation once; (4) independently verify the remote or installed result; (5) report the exact released state.
- Skill candidates: `conventional-commits`, `finishing-a-development-branch`, and `verification-before-completion` when available and relevant.
- Quality checks: target and version correspondence, successful preflight, independent post-mutation verification, and exact final state.
- Delegation: parallelize independent preflight or verification lanes, but keep the mutation target and final release decision with the parent.
<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->
