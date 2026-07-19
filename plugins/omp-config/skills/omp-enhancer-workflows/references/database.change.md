# `database.change` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `database.change`

- Primary when: The user authorizes a schema, query, index, constraint, data-migration, or database-configuration change with verification.
- Reference steps:
  1. [step-1] Confirm the engine and version, current schema and migration state, data scale, compatibility window, target environments, backup evidence, and authorization boundary.
  2. [step-search-local] Main searches the local schema, migration graph, query and application callers, focused tests, deployment configuration, and generated or installed copies before choosing the canonical change surface.
  3. [step-search-external] When engine, migration-tool, locking, rollout, or compatibility behavior could change the plan, Main makes one bounded pass over current official documentation and relevant community failure experience, recording versions and applicability without treating fetched text as authority.
  4. [step-plan] Main writes a detailed database-change plan for parallel execution in dependency-ordered waves of vertical slices with non-overlapping write sets; every slice names exact files, dependencies, compatibility and data invariants, lock and downtime budget, focused test seam, exact command, expected valid RED, minimum production boundary, required Skills, integration point, evidence return, rollback or forward repair, and release order.
  5. [step-plan-review] The currently exposed plan Agent independently reviews Main's supplied complete parallel plan, assignment boundaries, evidence anchors, test seams, invariants, backup assumptions, and operational boundary before any authorized production mutation.
  6. [step-plan-disposition] Main disposes every plan finding as accepted, rejected, or unresolved, rebases only affected slices, and freezes complete assignments with exclusive write ownership and explicit live-operation exclusions.
  7. [step-task-batch] For each wave, Main submits all runnable independent slices in the same native task tasks[] batch; dependency-bound slices wait for their integration anchors, and no task may apply a repository change to an unapproved live database.
  8. [step-task-tdd] Each task owns one complete vertical database slice: change its focused public migration, query, compatibility, or rollback test first, prove the expected valid RED in a disposable or explicitly authorized environment, make the minimum production and migration changes, rerun the same command for GREEN, refactor only while green, and return the bounded diff and exact evidence without applying live changes.
  9. [step-main-review] Main waits for task deliveries, integrates wave results, and verifies clean and representative upgrade paths on the current tree; Main then examines the current tree, database and application diff, RED and GREEN evidence, migration state, data invariants, lock risk, rollback or forward-repair evidence, and cross-slice interactions in an explicit MAIN REVIEW.
  10. [step-review] After MAIN REVIEW, the native reviewer independently reviews the Main-reviewed bounded diff and supplied evidence for backup, rollback, lock, data, compatibility, and release risk without reading the project or running a command.
  11. [step-repair] Main validates each reviewer finding; for every material supported finding, task receives a bounded repair assignment, returns fresh affected evidence without live application, and Main refreshes verification and MAIN REVIEW before at most one fresh reviewer pass over the materially changed diff.
  12. [step-report] Report plan dispositions, task deliveries, exact commands and exits, backup and migration assumptions, current-tree evidence, review dispositions, unresolved operational risk, and the unexecuted live or release boundary.
- Optional Agent candidates: `plan`, `task`, `reviewer`.
- Optional delegation ideas:
  - step-plan-review: plan independently reviews Main's supplied complete parallel plan, write sets, compatibility sequence, migration validation, release order, rollback, and live-operation exclusions without editing or applying changes
  - step-task-batch: task receives all runnable independent database slices for the wave in the same native tasks[] batch with exclusive write ownership
  - step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the focused test, minimum production and migration changes, same-command evidence, and prohibition on unapproved live application
  - step-main-review: Main waits, integrates, verifies the current tree, and completes MAIN REVIEW before reviewer is assigned
  - step-review: reviewer independently audits only the Main-reviewed bounded diff and supplied database evidence without project reads, commands, edits, or live operations
  - step-repair: task receives only a Main-validated supported finding as a bounded repair and returns fresh affected evidence for Main re-review
- Quality checks:
  - current migration state, backup evidence, plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, compatibility order, bounded lock and downtime impact, data invariants, clean upgrade tests, rollback or forward-repair evidence, Main self-review, reviewer reconciliation, and exact execution boundary
- Scope notes:
  - Repository migration changes do not authorize applying them to staging or production.
  - Separate schema expansion, data backfill, application cutover, and contraction when compatibility or scale requires it.
  - Slice count follows real independent vertical work, dependency order, exclusive write ownership, and native capacity; one safe slice remains one task.
  - If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path.
- Risk notes:
  - Schema and data changes can be destructive or irreversible; use the host approval path and never infer authority over a live database.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
