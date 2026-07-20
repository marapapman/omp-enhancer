# Non-simple workflow subagent-default plan

Date: 2026-07-19

## Objective

Make every selected non-simple workflow subagent-driven by soft default, including Chinese and English writing, while keeping workflow selection, Agent choice, fork width, permissions, integration, and completion with Main and OMP native authority.

The change must remain prompt and workflow guidance. It must not create a runtime router, gate, task interceptor, fixed fan-out, mandatory fork, automatic retry, continuation, or plugin-owned completion controller.

## Baseline evidence before implementation

- The canonical catalog contains 29 workflows.
- `agentic.simple` is the direct simple-work exception.
- `writing.pending` is a temporary language-discovery state; after the body language is known it must be replaced by `writing.zh` or `writing.en` before substantive work.
- The remaining 27 workflows are substantive workflow cards. At this baseline,
  nineteen named a domain or native Agent candidate and eight retained direct
  Main execution: `writing.latex`, `writing.markdown`, `doc.convert.word`,
  `database.review`, `ml.review`, `marketing.campaign`, `seo.audit`, and
  `release.publish`. The implemented catalog now gives all 27 the
  `subagent-driven` soft default and at least one optional Agent candidate.
- At this baseline, Main, Advisor, the shared catalog, and the compatibility
  reminder described only substantive code mutation as subagent-driven. The
  implemented prompts now apply the soft default to every selected non-simple
  workflow.
- The worktree already contains unrelated and earlier user changes. Every slice below owns only its listed files and must preserve all other edits.

This is a repository-local workflow-policy change with explicit user intent. No unstable external API or prompt-engineering fact is needed to choose the design, so external search is not required.

## Implemented architecture decision

### Canonical execution metadata

Add normalized `delegationDefault` metadata with exactly three values. When the
field is absent, schema normalization produces `subagent-driven`; this makes the
safe substantive default explicit in the normalized catalog without checking a
workflow ID at runtime. The two exceptions must declare their values in their
canonical definitions:

- `subagent-driven`: default for every substantive workflow.
- `direct-simple`: explicit only for `agentic.simple`.
- `defer-until-composed`: explicit only for `writing.pending`; Main reads the source, determines language, replaces the pending card, and then follows the selected language workflow's default.

Build-time schema validation requires every `subagent-driven` definition to name at least one optional Agent candidate. This validates generated guidance only; it does not inspect runtime availability or authorize a task.

The eight substantive definitions that currently have no role add the existing native `task` candidate with a bounded duty:

- format companions: `task` owns pure conversion or structure checkpoints; a composed `writing.zh` or `writing.en` writer/checker remains preferred for prose;
- `database.review` and `ml.review`: `task` performs a bounded read-only evidence audit and Main synthesizes;
- `marketing.campaign` and `seo.audit`: `task` owns complete channel, URL, or evidence slices when no more specific composed Agent owns them;
- `release.publish`: `task` may perform bounded read-only preflight or post-release verification, but Main alone owns authorization, versioning, publication, deployment, push, installation mutation, and final state reconciliation.

Agent candidates remain optional and must be present in OMP's current dynamic Available Agents list. No new Agent is created. Domain candidates take precedence over generic `task`. Plugin `plan` remains the software-plan reviewer and native `reviewer` remains the Main-reviewed code/diff reviewer; neither is added mechanically to unrelated domain cards.

### Main soft-default contract

Under the current seven-stage contract, Main uses `DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY`. PLAN `Skills` contains exact domain Skill/catalog URIs only, workflow references appear only in structured `THEN`, and the PLAN has at least four detailed Actions for LOAD, COMMIT, SPLIT + EXECUTE, and VERIFY. At COMMIT, READY initializes TODO and ends the response. The loaded-card soft compiler produces an exact `Delegate` row only when a selected `subagent-driven` card has complete input, a safe checkpoint, and a visible matching Agent; otherwise it records one matched permitted fallback. Parent VERIFY rows remain separate. The committed plan and bounded assignments preserve:

- selected workflow step and bounded assignment;
- whether the work is runnable and independent or dependency-bound;
- matching visible Agent and complete input;
- direct constraints and intended action;
- acceptance evidence and integration point.

Independent runnable checkpoints share one native task batch when the schema supports it; dependent writer/checker, research/cross-check, design/vision, and repair stages run after their prerequisites. Main owns the parent TODO, assignment boundaries, result integration, final verification, permissions, and user-visible delivery.

Direct execution is a documented fallback only when the user or native runtime forbids delegation, no matching Agent is exposed, capacity is unavailable, assignment input is incomplete, dependencies or write sets cannot be made safe, or a workflow step is explicitly parent-owned. Only a mechanical lookup skips workflow discovery, Skill, and TODO. A non-mechanical `direct-simple` task still follows `DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY` and its rebased TODO, but makes no native task assignment.

The existing code/OMP mutation lifecycle remains more specific: plan review, task-owned TDD slices, Main integration and `MAIN REVIEW`, bounded reviewer evidence, supported repair, and at most one fresh review pass. It is not imposed on prose, research, visual, review-only, or release workflows.

### Writing contract

- `writing.zh`: proposal-only `zh-writer` returns the draft/revision, read-only `zh-checker` independently returns an in-band review, Main accepts or rejects findings, and accepted findings may return once to `zh-writer` for a corrected proposal. Main alone decides and performs any authorized file change, then verifies anchors and format.
- `writing.en`: the same sequence with proposal-only `writer` and read-only, report-only `checker`.
- Writer and checker are dependency-ordered rather than parallel.
- The two writer roles expose only `read`, `grep`, and `glob`. The two checker roles remain read-only and report-only, with `web_search` available only for host- and user-authorized evidence verification; none of the four roles exposes `write` or `edit`, and assignment-level file authorization never upgrades a child capability.
- `writing.pending` does not guess a language Agent and does not delegate until the language workflow is selected.

### Advisor boundary

During the existing early advisory window, Advisor may spend its one `DECISION CHECK (optional)` to point out that a loaded `subagent-driven` card's TODO contains neither one visible matching Agent checkpoint nor a concrete fallback reason. It may not choose the Agent, assignment, fork width, task count, ordering, dispatch, retry, blocker, or completion decision.

## TDD and implementation waves

Dependency order is explicit: Slices A and C are independent Wave 1 work;
Slice B is Wave 2 and depends on A's normalized schema; Slice D is Wave 3 and
depends on A, B, and C; Slice E is Wave 4 and begins only after generated parity
is current. No sibling reads or writes another slice's files.

### Wave 1 / Slice A: canonical schema and definitions

Exclusive write set:

- `plugins/omp-enhancer-core/src/workflows/schema.js`
- `plugins/omp-enhancer-core/src/workflows/catalog.js`
- `plugins/omp-enhancer-core/src/workflows/definitions/general.js`
- `plugins/omp-enhancer-core/src/workflows/definitions/writing.js`
- `plugins/omp-enhancer-core/src/workflows/definitions/database.js`
- `plugins/omp-enhancer-core/src/workflows/definitions/ml.js`
- `plugins/omp-enhancer-core/src/workflows/definitions/growth.js`
- `plugins/omp-enhancer-core/src/workflows/definitions/operations.js`
- `plugins/omp-enhancer-core/test/workflow-subagent-default.test.js`
- `plugins/omp-enhancer-core/test/workflow-redesign-matrix.test.js`
- `plugins/omp-enhancer-core/test/workflow-consolidation.test.js`

Production anchors: `WORKFLOW_FIELDS` and `normalizeWorkflow` in `schema.js`,
catalog version/export projection in `catalog.js`, and the exact `roles`,
`delegation`, and exception metadata fields in the six listed definition files.

RED:

1. Assert catalog version 19 and normalized execution metadata. A synthetic
   substantive definition that omits the field must normalize to
   `subagent-driven`; the two exceptions must be explicit.
2. Assert exactly 27 `subagent-driven` workflows and the two exact exceptions.
3. Assert every subagent-driven workflow has at least one optional role.
4. Assert schema rejects an unknown execution value and a subagent-driven workflow with no role.
5. Assert the eight `task` fallback definitions preserve their read-only, composition, and Main-only effect boundaries.
6. Assert the Chinese and English writer/checker sequence remains unchanged, writer deliveries stay proposal-only, checker reports stay in-band, and only Main performs an authorized target mutation.

Focused RED/GREEN command:

```bash
node --test plugins/omp-enhancer-core/test/workflow-subagent-default.test.js plugins/omp-enhancer-core/test/workflow-redesign-matrix.test.js plugins/omp-enhancer-core/test/workflow-consolidation.test.js
```

Expected RED is a missing `delegationDefault` projection/version assertion and
the eight substantive empty-role assertions. GREEN requires all three files to
pass. Add the minimum schema, catalog, and definition changes; do not render or
generate assets.

### Wave 2 / Slice B: Core reminder and canonical renderers

Dependency: Slice A is integrated and GREEN so renderers can consume normalized
`delegationDefault`.

Exclusive write set:

- `plugins/omp-enhancer-core/index.js`
- `plugins/omp-enhancer-core/src/workflows/render-skill.js`
- `plugins/omp-enhancer-core/src/workflows/render-shared-markdown.js`
- `plugins/omp-enhancer-core/test/core-workflow.e2e.test.js`
- `scripts/generate-workflow-catalog.test.js`

Production anchors: `DELEGATION_DECISION` in Core, the state-handoff and
`renderCard` sections in `render-skill.js`, and the global delegation/writing
paragraphs plus `renderWorkflowCard` in `render-shared-markdown.js`.

RED:

1. Assert the compact index describes the three execution modes and Main-owned fallback.
2. Assert every per-workflow reference renders its exact execution default next to the READY handoff.
3. Assert `writing.pending` performs its one narrow language-only target read only after the initial READY/TODO response ends, then emits replacement PLAN/LOAD/READY before substantive work.
4. Assert the exact DeepSeek/MiMo compatibility reminder restates the general non-simple soft default and exact exceptions without selecting an Agent or fork.
5. Preserve prompt byte budgets and negative assertions against gates, routing, dispatch, fixed fan-out, retry, continuation, and completion authority.

Focused RED/GREEN command:

```bash
node --test plugins/omp-enhancer-core/test/core-workflow.e2e.test.js scripts/generate-workflow-catalog.test.js
```

Expected RED is the absence of the three-mode index/reference cue and the
general soft-default wording in the compatibility reminder. GREEN preserves
the existing reminder/index byte budgets. Update the canonical renderers and
replace, rather than append to, compact reminder text as needed for size. Do
not run the generator.

### Wave 1 / Slice C: Main and Advisor managed context

Exclusive write set:

- `AGENTS.md`
- `plugins/omp-config/assets/AGENTS.md`
- `plugins/omp-config/assets/CLAUDE.md`
- `plugins/omp-config/assets/WATCHDOG.yml`
- `plugins/omp-config/test/advisory-skills.test.js`
- `plugins/omp-config/test/config-diagnostics.test.js`

Production anchors: the COMMIT/READY delegated-TODO paragraphs in both Main
assets, the single early `DECISION CHECK (optional)` window in WATCHDOG, and the
matching repository-level paragraph in root `AGENTS.md`.

RED:

1. Replace the code-only default with the three-mode global contract.
2. Assert TODO disposition, domain-Agent priority, generic task fallback, dependency order, Main integration, and parent-only permissions/effects.
3. Assert simple/mechanical, pending-language, explicit user/native constraints, Agent/capacity/input/dependency/write-set limitations.
4. Assert Advisor can identify only a missing delegation-or-fallback disposition and cannot select or dispatch.
5. Preserve code-specific TDD and reviewer semantics plus all no-gate/no-router constraints.

Focused RED/GREEN command:

```bash
node --test plugins/omp-config/test/advisory-skills.test.js plugins/omp-config/test/config-diagnostics.test.js
```

Expected RED is the old code-only/read-only exemption and missing
delegation-or-fallback Advisor disposition. GREEN keeps the managed blocks
within their existing size limits. Make the managed prompts and repository
guidance semantically equivalent without importing the full catalog.

### Wave 3 / Slice D: one-shot generation and generated parity

Dependency: Slices A, B, and C are integrated and GREEN. This slice uniquely
owns every test that compares canonical source, managed prompts, and generated
catalog assets, avoiding a source-version/generated-version dependency cycle.

Exclusive write set:

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`
- `plugins/omp-config/test/workflow-context-sync.test.js`
- `scripts/workflow-context-parity.test.js`

First update the two owned integration tests for version 19, the three execution
modes, the global soft default, and generated/Main/Advisor parity. Run the
following before generation and capture the expected RED caused by stale
version-18 generated assets or missing generated execution-default lines:

```bash
node --test plugins/omp-config/test/workflow-context-sync.test.js scripts/workflow-context-parity.test.js
```

Then run `npm run generate:workflows` exactly once, inspect the complete
generated diff, rerun the same command for GREEN, and run
`npm run check:workflows`. Return the exact write set. Do not change canonical
source or rerun generation.

### Wave 4 / Slice E: deterministic E2E matrix and documentation

Dependency: Slice D completed and generated parity is current. This slice does
not run the shared generator.

Exclusive write set:

- `scripts/e2e/fixtures/deepseek-subagent-willingness.json`
- `scripts/e2e-installed-workflow.test.js`
- `scripts/e2e/workflow-events.mjs`
- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE.md`
- `docs/WORKFLOW_DEVELOPMENT.md`
- `docs/DEVELOPMENT.md`
- `plugins/omp-config/README.md`
- `plugins/writing-helper/README.md`

RED/GREEN matrix coverage:

- preserve mechanical direct and explicit Main-only negative controls;
- add a non-mechanical `agentic.simple` direct control that still requires the
  staged workflow trace and rebased TODO but permits zero task assignments;
- add a natural English writing scenario using `writing.en` + `writing.latex` and expecting dependency-ordered `writer` and `checker` deliveries without naming delegation in the prompt;
- add a natural `network.design` scenario expecting a completed `ecc-network-architect` assignment from a complete supplied brief;
- add an opt-in observation-only `requiredNativeTaskAgentSequence` expectation.
  A synthetic event test first fails because the evaluator does not yet prove
  that each later Agent assignment starts only after the previous Agent's
  successful delivery; the minimal evaluator then checks that dependency order.
  It is used only by the writing scenario and never becomes a global required
  fork, runtime hook, router, or gate;
- reuse existing observation-only native task, metadata, completion, workflow,
  Agent, and Skill expectations.

Focused RED/GREEN command:

```bash
node --test --test-name-pattern='subagent default matrix|dependency-ordered workflow assignments' scripts/e2e-installed-workflow.test.js
```

Expected RED is the missing matrix scenarios and missing dependency-order
expectation. GREEN proves the synthetic sequence and matrix shape; the complete
E2E test file runs later.

Docs describe the global soft default, exact exceptions, domain-Agent priority,
generic task fallback, dependent vs independent stages, Main-only effect
boundaries, and stochastic live evidence. The root README remains concise;
`docs/README.md` and Writing Helper document the same writing chain. Config
README's stale catalog version is updated to 19.

## Plan review and disposition

Before production changes, a read-only plan Agent reviews this complete plan for scope, schema choice, 27-workflow coverage, Agent existence, exception semantics, non-overlapping writes, TDD seams, one-shot generation, live scenarios, docs, dirty-tree containment, and absence of runtime authority. Main records every finding disposition before dispatching Wave 1.

## Verification

After integration:

1. Run each slice's focused RED/GREEN command.
2. Run `npm run check:workflows` after the one-shot generator and inspect no unexpected generated output.
3. Run relevant Core and Config workspace tests plus `node --test scripts/workflow-context-parity.test.js scripts/generate-workflow-catalog.test.js`.
4. Run `node --test scripts/e2e-installed-workflow.test.js`.
5. Run `npm test`, `npm run check:marketplace`, `npm run pack:all`, and `git diff --check`.
6. The five fixed-fixture English-writing canaries are complete and frozen.
   All had clean worktree-installed infrastructure; 004 nearly completed the
   contract, but all five remain behavior failures under the final strict
   evaluator. Do not rerun unchanged input or add prompt clauses without a new
   falsifiable hypothesis.
7. Main reviews the complete semantic diff, current-tree evidence, generated parity, Agent mappings, user constraints, and live behavior before reviewer handoff.
8. An independent reviewer sees only the Main-reviewed bounded semantic diff and evidence. Supported findings receive one bounded task repair and affected revalidation; at most one fresh reviewer pass follows a material repair.

No commit, push, release, marketplace refresh, version bump, installed plugin upgrade, or symlink mutation is authorized by this task.

## Expanded all-Skill conflict audit

The implementation scope now includes the user's explicit request to inspect
every packaged Skill for conflict with the current workflow contracts. This is
not a keyword-only cleanup: every `SKILL.md` is included in the inventory, and
high-risk orchestration, authority, lifecycle, resource, and actor-boundary
matches receive a body-level review.

Inventory baseline before the conflict repairs:

- 313 `SKILL.md` files, all with frontmatter names and no duplicate names;
- 58 directly visible top-level Skills and 255 exact-URI ECC nested guides;
- 49 unique Skill candidates referenced by the 29 workflow cards, with 49/49
  resolving to packaged Skills;
- 255/255 generated ECC catalog URIs resolving to nested guides;
- aggregate SHA-256 over sorted Skill path/content pairs:
  `515616b67eb8a419549fabdc4b7eb1264c3bd7fd2afa32b87167cbddb50c72bc`.

The audit classifies findings rather than treating words such as “gate”,
“router”, “block”, or “loop” as proof by themselves. Evidence/verdict
thresholds, a network-device router, bounded artifact review, an explicit
monitoring window, and a deployment CI safety policy may be valid domain
methods. A conflict requires the Skill to override the selected workflow,
OMP-native authority, current exposed tool/Agent schema, parent/child actor
boundary, explicit effect authorization, or bounded completion behavior.

### Live evidence after the bounded prompt repairs

Five worktree-installed DeepSeek canaries used the same English LaTeX writing
fixture under preceding prompt revisions. The progression showed both improved fork willingness and unresolved
stochastic compliance: 001 selected the right resources but replaced the
writer/checker rows with direct TODOs; 002 forked both children but drifted
metadata; 003 ignored the staged reminder; 004 completed the correct two-child
sequence but placed narration before visible PLAN/READY; and 005 again ran both
children while keeping PLAN/READY in hidden reasoning and dropping the format
Add-on from checker metadata. The later DIRECT/rebase/fallback corrections have
deterministic coverage but were not followed by another live run.

The full frozen evidence and exact result paths are recorded in
`docs/SKILL_WORKFLOW_CONFLICT_AUDIT_2026-07-19.md`. These are soft prompt and
Agent-behavior limitations, not reasons to add a router, interceptor, dispatch
hook, completion gate, or automatic retry loop.

### Plan-review disposition and bounded repair scope

The first review accepted the read-only audit but rejected a blanket mutation
of every high-risk keyword match. That finding is accepted. This task will
publish the full audit disposition, repair only the exact conflicts that can
change the already authorized workflow/subagent behavior, and leave unrelated
authority or portability findings as `PROPOSED` in the audit report.

The three disjoint human-review groups are:

- Writing owner: all 28 Writing Helper Skills; writing/format candidates from
  other groups are only cross-group evidence and remain owned by their own
  disjoint group;
- top-level owner: the 25 non-ECC Config Skills and four Fact Checker Skills;
- ECC owner: the top-level adapter and all 255 nested ECC Skills.

The baseline hash was produced by sorting repository-relative `SKILL.md` paths
bytewise, running `sha256sum` on each file in that order, and hashing the exact
resulting checksum lines once more. The audit report includes the reproducible
command and therefore fixes both the path/content framing and ordering.

#### Repair Wave A: audit artifact only

Exclusive write set:

- `docs/SKILL_WORKFLOW_CONFLICT_AUDIT_2026-07-19.md`

This slice records all 313 entries by group and disposition, lists every
confirmed conflict with evidence, distinguishes `ALIGNED`,
`DOMAIN_CONSTRAINT`, `CONDITIONAL_TARGET_SYSTEM`, and `PROPOSED`, and freezes
the live evidence available at audit closeout. It changes no Skill or runtime
behavior.

#### Repair Wave B1: writing trace actor boundary

Exclusive write set:

- `plugins/writing-helper/test/plugin-content.test.js`
- `plugins/writing-helper/agents/writer.md`
- `plugins/writing-helper/agents/checker.md`
- `plugins/writing-helper/agents/zh-writer.md`
- `plugins/writing-helper/agents/zh-checker.md`
- `plugins/writing-helper/skills/writing-review/SKILL.md`
- `plugins/writing-helper/skills/zh-writing-review/SKILL.md`
- `plugins/writing-helper/skills/zh-writing-polish/SKILL.md`
- `plugins/writing-helper/skills/writing-markdown-helper/SKILL.md`
- `plugins/writing-helper/skills/zh-writing-markdown-helper/SKILL.md`

RED asserts that writer-local self-check cannot claim to replace the independent
checker, writer roles expose only `read`, `grep`, and `glob`, every writer-facing
method returns a proposal instead of mutating files, and checker methods return
reports in-band without `write` or `edit`. Checker `web_search` remains available
only for host- and user-authorized evidence verification. Main retains finding
disposition and is the only actor that may perform an authorized file change.
GREEN changes only those actor boundaries; it does not add another writing loop,
hard route, gate, or required Agent when unavailable.

Focused command:

```bash
node --test plugins/writing-helper/test/plugin-content.test.js
```

#### Repair Wave B2: prose Primary and assignment handoff

Depends on B1. Exclusive write set:

- `plugins/omp-enhancer-core/src/workflows/render-skill.js`
- `plugins/omp-enhancer-core/src/workflows/render-shared-markdown.js`
- `scripts/generate-workflow-catalog.test.js`
- `plugins/omp-enhancer-core/test/workflow-consolidation.test.js`

RED covers three directions: a prose revision makes `writing.en` or
`writing.zh` Primary with the requested LaTeX/Markdown/Word format as Add-on;
format-only conversion keeps its converter/format Primary; unknown body
language retains `writing.pending`. It also requires one exact assignment
metadata reminder at the per-card execution handoff, not repeated throughout
each card. GREEN changes canonical renderer guidance only.

Focused command:

```bash
node --test scripts/generate-workflow-catalog.test.js plugins/omp-enhancer-core/test/workflow-consolidation.test.js
```

#### Repair Wave C1: ECC adapter source

Independent of B. Exclusive write set:

- `scripts/generate-ecc-skill-catalog.js`
- `scripts/generate-ecc-skill-catalog.test.js`

RED requires the generated adapter to distinguish workflow, Agent, visible
domain Skill, and catalog namespaces, and to require the exact `catalog.md`
read once a declared catalog adapter succeeds. GREEN changes the generator
source only and does not touch generated files.

Focused command:

```bash
node --test scripts/generate-ecc-skill-catalog.test.js
```

#### Repair Wave C2: exact current-workflow ECC conflicts

Independent of B and dependent only on the read-only audit. Exclusive write
set:

- `plugins/omp-config/test/ecc-workflow-contract.test.js`
- `plugins/omp-config/skills/ecc/deep-research/SKILL.md`
- `plugins/omp-config/skills/ecc/gan-style-harness/SKILL.md`
- `plugins/omp-config/skills/ecc/mle-workflow/SKILL.md`
- `plugins/omp-config/skills/ecc/santa-method/SKILL.md`
- `plugins/omp-config/skills/ecc/council/SKILL.md`
- `plugins/omp-config/skills/ecc/click-path-audit/SKILL.md`
- `plugins/omp-config/skills/ecc/team-builder/SKILL.md`
- `plugins/omp-config/skills/ecc/skill-stocktake/SKILL.md`
- `plugins/omp-config/skills/ecc/rules-distill/SKILL.md`
- `plugins/omp-config/skills/ecc/search-first/SKILL.md`

RED is path-specific: no fixed two/three/eight reviewer or researcher width,
no Claude `Agent(...)`, `Task`, `general-purpose`, or `.claude` inventory as
the current OMP dispatch surface, no both-PASS ship gate or automatic
review-repair loop, no nonexistent local Skill URI suggestion, and code slices
remain native-`task`-owned TDD. GREEN preserves each domain method while making
width dynamic, findings advisory, repair bounded, and Main responsible for
plan, integration, verification, and fallback.

Focused command:

```bash
node --test plugins/omp-config/test/ecc-workflow-contract.test.js
```

The later full-inventory pass resolved additional direct conflicts and records
the remaining conditional model, target-system, command, installer, upload,
and publication findings in `SKILL_WORKFLOW_CONFLICT_AUDIT_2026-07-19.md`.
Valid network, payment, CI, monitoring, and bounded verification policies
remain unchanged.

#### Repair Wave D: directly visible authoring compatibility

Depends on the audit. Exclusive write set:

- `plugins/omp-config/test/advisory-skills.test.js`
- `plugins/omp-config/skills/writing-skills/SKILL.md`
- `plugins/omp-config/skills/deepseek-tool-calling/SKILL.md`

RED is exact to these two Skills: no dangling bundled-resource references,
hard “No exceptions” authoring gate, nonexistent `TodoWrite`, default
commit/push, `alwaysApply: true`, or fixed schema that overrides the currently
exposed tool contract. GREEN rewrites the authoring Skill compactly using the
current skill-creator method and makes DeepSeek tool guidance on-demand while
preserving the intentional exact-model Core reminder.

Focused command:

```bash
node --test plugins/omp-config/test/advisory-skills.test.js
```

Other top-level permission and portability findings are tracked by the final
Skill/workflow conflict audit. That audit, rather than this implementation
plan, is the current disposition source.

#### Repair Wave E: unique generated-asset transactions

Depends on B2 and C1, with no other worker allowed to run either generator.

ECC transaction exclusive write set:

- `plugins/omp-config/skills/ecc/SKILL.md`
- `plugins/omp-config/skills/ecc/catalog.md`

Run `npm run generate:ecc-skills` exactly once, inspect both outputs, then run
`npm run check:ecc-skills`.

Workflow transaction exclusive write set:

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`

Run `npm run generate:workflows` exactly once for this second canonical
renderer transaction, inspect all outputs, then run `npm run check:workflows`.
The earlier v19 generation remains historical evidence and is not counted as
this new renderer transaction.

#### Repair Wave F: integration, audit closeout, and live evidence

Depends on A, B1, B2, C1, C2, D, and both generated transactions in E.

Main updates only the audit report with repaired/proposed dispositions, the
post-repair hash, exact RED/GREEN evidence, generated parity, and validation
results. No global fuzzy phrase-ban is added. Structural inventory tests and
path-specific defect tests are the regression seam; OMP extension frontmatter
fields use an explicit repository allowlist rather than the generic validator.

The original live runs are completed and frozen. Each later canary was run only
after a recorded prompt or evaluator hypothesis changed; the final fixed
English-writing series contains five runs. Infrastructure conformance is
reported separately from stochastic model behavior, and no unchanged-input
retry is treated as evidence.

After these waves, the original verification sequence, Writing Helper
coverage, and ECC generation parity all passed. The audit report is the
authoritative source for current Skill counts, post-repair hash, five-canary
progression, residual conditional findings, and the explicit conclusion that
stable DeepSeek Flash compliance is not yet proven.
