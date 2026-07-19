# `database.migration.repair` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `database.migration.repair`

- Primary when: A database migration failed, diverged, partially applied, or left environments at inconsistent states and the user wants diagnosis and an authorized repair.
- Reference steps:
  1. [step-1] Freeze the target environment boundary and collect the exact migration command, tool and database versions, migration state, failure output, schema state, backup status, and affected data evidence.
  2. [step-search-local] Main searches the local migration graph, schema history, application callers, repair and rollback seams, adjacent tests, configuration, and recorded failure state, then reproduces or models the transition in a disposable environment and classifies it as unapplied, partially applied, divergent, locked, or data-dependent.
  3. [step-search-external] When current database or migration-tool recovery semantics could change the repair, Main checks official versioned recovery documentation and bounded community failure reports, keeping them separate from the observed local state and live authority.
  4. [step-plan] Main writes a detailed migration-repair plan for parallel execution in dependency-ordered waves of vertical slices with non-overlapping write sets; each slice names exact files, failed-state dependencies, backup and invariant prerequisites, focused test seam, exact command, expected valid RED, minimum production repair boundary, required Skills, idempotency and compatibility checks, integration point, evidence return, rollback or forward repair, and a stop condition.
  5. [step-plan-review] The currently exposed plan Agent independently reviews Main's supplied complete parallel plan, assignment boundaries, failure-state anchors, backup assumptions, test seams, invariants, stop condition, and live-operation boundary before any authorized production mutation.
  6. [step-plan-disposition] Main records every accepted, rejected, and unresolved plan finding, rebases only affected slices, and freezes complete assignments with exclusive write ownership and no implied authority over a live recovery command.
  7. [step-task-batch] For each wave, Main submits all runnable independent slices in the same native task tasks[] batch; dependency-bound slices wait for the required migration-state anchor, and task assignments remain limited to repository artifacts and disposable evidence.
  8. [step-task-tdd] Each task owns one complete vertical repair slice: change a focused test representing its failed migration state, prove the expected valid RED in a disposable environment, make the minimum production repair without touching an unapproved live database, rerun the same command for GREEN, refactor only while green, and return the bounded diff plus exact state-aware evidence.
  9. [step-main-review] Main waits for task deliveries, integrates wave results, and verifies every relevant migration state on the current tree; Main then examines the current tree, repair diff, RED and GREEN evidence, backup status, data invariants, clean installation, idempotency, rollback or forward-repair path, cross-slice interactions, and live-operation boundary in an explicit MAIN REVIEW.
  10. [step-review] After MAIN REVIEW, the native reviewer independently reviews the Main-reviewed bounded diff and supplied evidence for diagnosis, migration state, backup, data, rollback, idempotency, and operational risk without reading the project or running a command.
  11. [step-repair] Main validates each reviewer finding; for every material supported finding, task receives a bounded repository repair assignment, returns fresh affected evidence from disposable state, and Main refreshes verification and MAIN REVIEW before at most one fresh reviewer pass over the materially changed diff.
  12. [step-report] Report failure classification, plan and review dispositions, task deliveries, exact disposable commands and exits, backup and migration-state assumptions, remaining proof gaps, and every live operation that was not authorized or executed.
- Optional Agent candidates: `plan`, `task`, `reviewer`.
- Optional delegation ideas:
  - step-plan-review: plan independently reviews Main's supplied complete parallel state-aware repair plan, write sets, validation, stop condition, rollback, backup assumptions, and live boundary without editing or applying changes
  - step-task-batch: task receives all runnable independent migration-repair slices for the wave in the same native tasks[] batch with exclusive write ownership
  - step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the failed-state test, minimum production repair, same-command evidence, and prohibition on unapproved live recovery
  - step-main-review: Main waits, integrates, verifies the current tree, and completes MAIN REVIEW before reviewer is assigned
  - step-review: reviewer independently audits only the Main-reviewed bounded diff and supplied migration evidence without project reads, commands, edits, or live operations
  - step-repair: task receives only a Main-validated supported finding as a bounded repository repair and returns fresh affected evidence for Main re-review
- Quality checks:
  - exact failure and migration state evidence, backup status, reproducible transition, root-cause classification, complete plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, data invariants, state-aware regression coverage, clean and partial-state verification, Main self-review, reviewer reconciliation, rollback or forward-repair evidence, and live-operation boundary
- Scope notes:
  - Diagnose from recorded state and disposable reproductions first; repository repair does not authorize a live recovery command.
  - Do not rewrite already deployed migration history unless the exact tool, environment state, and user authorization make that operation safe and necessary.
  - Slice count follows real independent vertical work, migration-state dependencies, exclusive write ownership, and native capacity; one safe slice remains one task.
  - If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path.
- Risk notes:
  - A mistaken repair can destroy data or make migration history diverge further; require backup evidence, explicit environment identity, bounded commands, and a stop condition before live recovery.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
