# Flash Main prompt optimization

This note records the offline prompt-optimization loop used for exact
`opencode-go/deepseek-v4-flash` and evaluated against exact
`opencode-go/mimo-v2.5`. The method follows the public
[SkillOpt implementation](https://github.com/microsoft/SkillOpt),
[documentation](https://github.com/microsoft/SkillOpt/blob/main/docs/index.md),
and [paper](https://arxiv.org/abs/2605.23904):
collect repeated rollouts, reflect on failures, aggregate only well-supported
edits, select on separate tasks, and keep a rejected-candidate buffer. It does
not add a runtime router, hard gate, automatic retry, or completion controller.

The section **Current staged organization, 2026-07-20** summarizes the current
runtime-facing prompt contract. Sections explicitly labeled **Historical
snapshot** preserve the prompt and measurements used by earlier experiments;
their phase names, sizes, load order, and acceptance status are not current
runtime instructions. The canonical current contract remains
[Architecture and runtime contracts](ARCHITECTURE.md).

## Objective and invariants

The optimization target is stable autonomous behavior across task families:

- consult workflow navigation before analytical, judgment, composition,
  coordinated-stage, or possible-delegation work;
- explicitly declare exact workflows, Skills, load order, and a detailed usage
  plan before substantive project work;
- load an owning domain Skill for its method, evidence rule, verdict, or format;
- rebase a detailed TODO from the loaded workflow and Skill bodies, then execute
  its phases in order;
- avoid Skills for a mechanical field lookup;
- compose Primary and Add-on workflows without treating either as routing;
- fork only when Main's own task facts support independent native assignments;
- integrate successful child evidence without reopening the delegated audit.

The host remains authoritative for tools, Agents, permissions, delegation, and
completion. A missing Skill read, workflow trace, assignment prefix, fork, or
review is evaluation evidence, not permission to block or continue a session.

## Optimization loop

1. Freeze the model, plugin set, tool set, task prompt, fixture, and evaluator.
2. Keep task families separate: use development rollouts for reflection,
   selection tasks for candidate choice, negative controls for over-triggering,
   and held-out task families for the final audit.
3. Classify each failure as `SKILL_DEFECT`, `EXECUTION_LAPSE`, or
   `HARNESS_DEFECT`. If the current instruction already prevents the failure,
   do not automatically turn the trajectory into another prompt rule.
4. Aggregate repeated failures into one bounded edit. Change one decision
   boundary at a time and preserve successful behavior from earlier rollouts.
5. Accept a candidate only for strict cross-family improvement. A gain on one
   Skill is insufficient when workflow composition, delegation, verification,
   or a negative control regresses.
6. Keep rejected edits and their trajectories. Old-prompt trajectories remain
   hypotheses; they do not prove a defect in the current prompt.
7. Regenerate packaged workflow assets and run prompt-parity, event-parser, and
   plugin tests before treating the candidate as current.

This is an offline development loop. The installed runtime neither rewrites its
own prompt nor uses evaluation outcomes as a gate.

## Historical snapshot: previously accepted candidate

At that point in the experiment, the retained candidate used two short, ordered
decisions:

- `DISCOVER`: analytical or judgment work reads and waits for the compact
  workflow index before project work; a mechanical field lookup proceeds
  directly. Comparison, audit, and verdict tasks are explicitly non-mechanical.
- `RESOURCES`: the workflow index is navigation, never the domain method. Main
  reads a visible owning domain Skill before project work, then stops loading.

The evaluated shared workflow context used a private `SELECT / SPLIT / EXECUTE /
VERIFY` record. Verification used a finite reason set and direct successful
child delivery; a narrow project read needs a named evidence reason, while an
artifact read is reserved for an explicit material preview or truncation.

That candidate was selected because it preserved all workflow-reference and
mechanical negative controls while recovering the important two-file native
fan-out. The Core reminder deliberately keeps the concise child-integration
wording that performed better than repeated finite-reason rewrites; the shared
context owns the full finite verification contract.

## Current staged organization, 2026-07-20

The current prompt uses the soft sequence
`DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY` and keeps
all choices with Main:

- Core gives only exact `opencode-go/deepseek-v4-flash` and exact
  `opencode-go/mimo-v2.5` a compact, state-aware, top-level one-shot bootstrap.
  It chooses the smallest entry from current workflow-Skill visibility, other
  Skills, native `task`, delegation permission, and exact supplied-index
  provenance; it does not repeat the catalog or choose a workflow.
- `DISCOVER` is complete without a resolver read only when OMP supplied the
  exact native `skill-prompt` body named `omp-enhancer-workflows`. Managed
  context, an Available Skills description, or another Skill body does not
  count. The bootstrap therefore labels the project entry either supplied, in
  which case Main does not reread it, or not supplied, in which case Main reads
  only `skill://omp-enhancer-workflows` and waits.
- The generated index front-loads `DECLARE HANDOFF (soft)` before its domain rows.
  Its result therefore first tells Main that the next response begins at byte 0
  with a filled `WORKFLOW PLAN`, then provides the selection table. PLAN lists
  one Primary, independently matched Add-ons, exact Skill/catalog URIs,
  structured `NOW`/`THEN`, and detailed LOAD, COMMIT, SPLIT + EXECUTE, and
  VERIFY actions.
- Index `D` entries are top-level exact Skill URIs and index `C` entries are
  enumerated nested ECC exact Skill URIs. They are optional candidates, never
  load sets: Main selects only URIs matching the requested method, evidence
  rule, verdict, or format. A selected D/C entry goes directly into PLAN and,
  when not natively supplied, NOW. Main does not read the full ECC catalog
  first. `skill://ecc-skill-catalog` is reserved for an unlisted long-tail need
  and may reveal further exact same-namespace URIs through the bounded
  resource-extension chain. A preservation-only `writing.latex` Add-on selects
  zero format Skills; an explicit conversion or template selects one matching
  candidate.
- Workflow references appear only in THEN, with Add-ons first and the Primary
  last. Main waits after each declared resource batch and never guesses or
  rereads a URI.
- Every workflow reference carries two `READY NEXT (soft)` sentinels, one before
  and one after its detailed body. Both redundantly cue the next response to
  begin at byte 0 with `WORKFLOW READY | ...`, contain no other visible text,
  initialize native TODO only, and end/wait before any project tool. The
  generated sentinels remain non-enforcing. A bounded Core coach may observe
  Main-declared phase facts and host results, then restate the next syntax
  boundary on the next natural request; it neither validates semantic choices
  nor controls progression.
- Every delegated native TODO `items[]` string is the complete exact
  `Delegate Agent=... workflow=... step=... skills=... checkpoint=...` row.
  Native `tasks[].task` itself begins at byte 0 with the mechanically copied
  `[workflow=... step=... todo=... skills=...]` four-key prefix. Every native
  `task` call also carries nonempty top-level `context`. Batch
  `context`, name, label, or a request that the child output metadata cannot
  substitute for that body prefix.
- For `writing.en` and `writing.zh`, initial TODO freezes exact step-2 writer,
  step-3 checker, and conditional step-4 corrected-proposal Delegate rows.
  Main dispatches step 4 only after accepting at least one checker finding;
  otherwise it resolves/completes that no-op checkpoint rather than dropping or
  abandoning it. Writer proposals and checker reports are directly usable and
  complete in terminal child delivery, never status-only or artifact-reference-only,
  using the host's current terminal handoff when exposed or the ordinary final
  response otherwise; this contract is host-neutral.

The generated compact index for this organization is checked against its prompt
budget by the current generation contract. This document intentionally avoids a
fixed byte count because the exact artifact changes when rows or handoff wording
are regenerated.

Execution advances committed phases in order, while genuinely independent
sibling items may still use one native batch. Replanning requires a new concrete
dependency, scope, permission, tool, Agent, schema, capacity, Skill-load, or
contradictory-project fact. Advisor uses its existing one-note early budget to
check only visible plan/load/TODO drift. The phase-local coach can observe the
mechanical marker and host-result sequence, but it only appends `PRE_PLAN`,
`PRE_READY`, or `PRE_DISPATCH` to the copied context of the next natural
request. A normal task receives at most one of each; the single
`writing.pending` replacement may add one second-generation `PRE_READY`.
`OMP_ENHANCER_DISABLE_PROTOCOL_COACH=1` disables this path. It does not trigger
a turn, select a workflow, Skill, Agent, or fork, or create a router, gate,
retry, permission, or completion controller.

The 2026-07-18 same-matrix DeepSeek/MiMo evidence and model decision are recorded
in [Main Model Workflow Evaluation, 2026-07-18](MAIN_MODEL_WORKFLOW_EVALUATION_2026-07-18.md).

## Historical snapshot: progressive-disclosure candidate, 2026-07-19

This snapshot records the candidate evaluated on 2026-07-19. It reduced
decision load without deleting workflow semantics or adding a router:

- the index keeps only exact workflow IDs, complete selection conditions, and
  literal `PLAN URI` values; the evaluated candidate materially reduced the
  generated index relative to its predecessor and stayed within the configured
  budget, while exact byte counts remain generation-time evidence rather than a
  durable documentation contract;
- each selected workflow loads one card with line-separated execution steps,
  optional Agent/delegation ideas, checks, scope, risk, and an exact READY
  handoff; per-card references no longer reopen Add-on or Skill selection;
- workflow steps describe capabilities rather than requiring an optional Agent,
  and a late workflow method applies only when that workflow was selected in PLAN;
- at that time, resource order was domain Skills or catalogs first, exact nested
  Skills next when a declared catalog revealed them, and workflow references
  last so the final resource result directly cued READY;
- PLAN and READY must appear in visible assistant text. Thinking, tool arguments,
  files, placeholders, and `...` do not count. The output bridge tells Main to
  copy the filled PLAN block before constructing any tool call.

Repeated Docker development batches showed that workflow discovery and selection
were already substantially more stable than the public checkpoints: across C39
through C42 at `max`, index discovery appeared in 19/20 runs, while correctly
placed PLAN appeared in 13/20 and READY in 10/20. Several misses contained a
complete PLAN or READY only in private thinking or replaced visible text with
`...`. This evidence argues against merging workflow IDs as the first remedy and
motivates the visible checkpoint bridge instead. A five-run `high` comparison did
not improve compliance, so the packaged default remains `max`.

Two reference-last retry attempts encountered provider HTTP 500 errors or hung
before producing usable behavior evidence. They are excluded rather than counted
as model failures. That candidate remained under evaluation; no 90% stability
claim follows from the partial batches. Its catalog-first nested-Skill path was
later replaced by the current direct `C` URI path described above.

## Historical snapshot: measured rollouts

All rows below are real isolated RPC runs with DeepSeek Flash at high thinking.
Counts describe observed behavior, not a plugin guarantee.
The final fact trajectories were replayed with the current event evaluator after
the Markdown-verdict parser fix; their saved raw report contains the older
evaluation alongside the unchanged events and final text.

| Candidate | Selection evidence | Cross-family result | Decision |
| --- | --- | --- | --- |
| Frozen baseline | Fact domain Skill `0/2`; workflow reference `2/2`; mechanical negative `1/2` | Missed the fact method and sometimes over-read the workflow index | Reject |
| Domain-priority candidate | Fact domain Skill `2/3`; workflow reference `3/3`; mechanical negative `3/3` | Held two-file audit did not fork and made 23 parent project reads | Reject |
| Catalog-first candidate | Final fact rerun: verdict semantics `3/3`, fact Skill observed `3/3` and strictly before project reads `2/3`; workflow reference `3/3`; mechanical negative `3/3` | Recovered workflow-first selection and two-agent native fan-out | Retain |
| Dedicated domain-Skill turn | Workflow reference `3/3`; mechanical negative `3/3` | Stronger wording reduced strict fact-Skill ordering from `2/3` to `0/3` | Reject and revert |
| Broad creation/transformation wording | Writing Skill observed in `1/3` but over-loaded Skills; XLSX Skill `0/3`; mechanical negative `3/3` | Added tokens without generalizing to the held-out creation tasks | Reject and revert |

The final exact two-file run observed:

- workflow index as the first project-related read;
- zero parent project reads before native `task`;
- one native batch with two successful independent assignments;
- zero parent project reads after native `task`;
- two permitted one-time preview artifact reads and no artifact-policy violation;
- one non-empty final response.

That run still omitted the four-key workflow metadata prefix on both
assignments. An earlier catalog-first run preserved both prefixes but reopened
12 parent reads after delegation. This variation is an `EXECUTION_LAPSE` signal,
not evidence that a hard dispatcher is needed.

Held-out results for the previously accepted candidate remain mixed: Docker Compose used its domain Skill in
`2/2` runs, while English writing and XLSX used their expected domain Skills in
`0/2` runs. Skill use therefore remained probabilistic in that snapshot. The
staged-planning candidate addresses the observed omission by making selection,
loading, and post-load TODO alignment explicit. Later same-matrix evidence is
kept in the separate model-evaluation report so this historical table remains
auditable.

Local reports from this experiment are under:

```text
.omp/e2e-results/skillopt-baseline-selection-skills/
.omp/e2e-results/skillopt-candidate-2-selection-skills/
.omp/e2e-results/skillopt-candidate-2-two-file-baseline/
.omp/e2e-results/skillopt-catalog-first-selection/
.omp/e2e-results/skillopt-catalog-first-two-file/
.omp/e2e-results/skillopt-final-core-plus-skill/
.omp/e2e-results/skillopt-final-fact-rerun/
.omp/e2e-results/skillopt-final-heldout-skills/
.omp/e2e-results/skillopt-dedicated-domain-fact/
.omp/e2e-results/skillopt-dedicated-domain-workflow/
.omp/e2e-results/skillopt-dedicated-domain-negative/
.omp/e2e-results/skillopt-creation-candidate-selection/
```

## Evaluator requirements

The evaluator uses event evidence rather than model self-report. It records
assistant batch and content provenance, successful Skill reads and their order
relative to project tools, native task batches and assignments, workflow
metadata, child completion, project reads before and after delegation, artifact
preview reads, and final-answer count. It treats only the exact native
`skill-prompt` body named `omp-enhancer-workflows` as a supplied index;
otherwise it verifies index-only discovery. It also verifies byte-0 PLAN and
READY event intervals, request-matched selected `D`/`C` URI loading, absence of
an unnecessary full ECC catalog read for enumerated `C`, preservation-only
LaTeX compositions with zero format Skill reads, the bounded long-tail catalog
chain, exact delegated TODO `items[]` strings, native `tasks[].task` byte-0
four-key prefixes, nonempty top-level `context` on every native task call,
and resource/project batch separation. Outer `context`, name, label, or child
self-report cannot satisfy the assignment-body check. Writing traces separately
check the three frozen step-2/step-3/conditional-step-4 rows, conditional
step-4 dispatch, and complete terminal writer/checker deliveries. Deterministic
prompt tests separately verify that the exact-model
bootstrap is one-shot and state-aware, and generated-asset tests prove the
index PLAN handoff and reference READY handoff precede their selection/card
bodies. Mechanical controls reject workflow markers, Skills, TODO, and delegation. Assistant
`stopReason=error` is reported as a model or transport error so it cannot
masquerade as workflow noncompliance.

Fact-check scenarios additionally require a verdict per numbered claim. Verdict
parsing accepts Markdown headings, bold labels, a following standalone status,
strict two-column verdict rows, and numbered headings such as
`Verdict 1 — INSUFFICIENT`. Evidence, analysis, reasoning, and limitation
boundaries close the permissive standalone-status window, while a later
explicit `Verdict` label remains bound to the same claim until the next claim
or heading. This prevents explanatory status words from satisfying a verdict
without rejecting the common analysis-first table layout.

## Reproduction

Run focused matrices repeatedly rather than treating one pass as deterministic.
The generic aliases accept an explicit model; the older `e2e:deepseek:*` aliases
remain available for compatibility:

```bash
npm run e2e:main:skills -- --model opencode-go/deepseek-v4-flash --thinking max --repeat 3 --output .omp/e2e-results/candidate-deepseek-skills
npm run e2e:main:skills -- --model opencode-go/mimo-v2.5 --thinking max --repeat 3 --output .omp/e2e-results/candidate-mimo-skills
npm run e2e:main:subagents -- --model opencode-go/deepseek-v4-flash --thinking max --repeat 3 --output .omp/e2e-results/candidate-deepseek-subagents
```

Then validate generated context and parsers:

```bash
npm run check:workflows
node --test scripts/e2e-installed-workflow.test.js
node --test scripts/generate-workflow-catalog.test.js scripts/workflow-context-parity.test.js
```

When comparing candidates, keep the same fixtures and runtime configuration,
inspect both successful and failed trajectories, and reject any edit that only
moves the failure into another task family. A protocol-coach A/B keeps the
model, bootstrap reminder, fixture, thinking level, plugins, and evaluator
fixed and changes only `OMP_ENHANCER_DISABLE_PROTOCOL_COACH=1`; each invocation
still produces a stochastic sample, not proof of stable improvement.
