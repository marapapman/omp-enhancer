# `ml.debug` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `ml.debug`

- Primary when: A training, evaluation, model loading, tensor, device, gradient, data loader, artifact, batch inference, or online inference path fails and the user wants diagnosis or an authorized fix.
- Reference steps:
  1. [step-1] Capture the exact command or request, code and dependency revision, model and dataset identifiers, device and precision, seed, environment, and current failure evidence.
  2. [step-search-local] Main searches local entry points, callers, focused tests, configuration, model and data contracts, and artifact metadata, then traces the smallest failing path across shape, dtype, device, preprocessing, model state, gradients, loaders, serialization, and train-serve parity.
  3. [step-search-external] When current framework, device, serialization, or serving behavior could change the diagnosis, Main checks versioned official documentation and bounded community failure experience, records applicability, and keeps it separate from local artifact and runtime evidence.
  4. [step-plan] Main writes a detailed ML repair plan for parallel execution in dependency-ordered waves of vertical slices with non-overlapping write sets; every slice names exact files, dependencies, diagnosed cause, deterministic bounded test seam, exact command, expected valid RED, minimum production boundary, required Skills, device and resource budget, artifact exclusions, integration point, returned evidence, and affected serving contract.
  5. [step-plan-review] The currently exposed plan Agent independently reviews Main's supplied complete parallel plan, assignments, local and external anchors, diagnosed cause, deterministic test seams, resource budget, and artifact boundary before any authorized production mutation.
  6. [step-plan-disposition] Main records every accepted, rejected, and unresolved plan finding, rebases only affected slices, and freezes complete assignments with exclusive write ownership and explicit data, checkpoint, cache, and generated-model exclusions.
  7. [step-task-batch] For each wave, Main submits all runnable independent slices in the same native task tasks[] batch; dependency-bound slices wait for their declared artifact or integration anchor, and each task stays within its bounded compute and write budget.
  8. [step-task-tdd] Each task owns one complete vertical ML slice: change its focused deterministic public-behavior test first, prove the expected valid RED on a bounded fixture, make the minimum production code or configuration change without rewriting protected artifacts, rerun the same command for GREEN, refactor only while green, and return the bounded diff and exact resource-aware evidence.
  9. [step-main-review] Main waits for task deliveries, integrates wave results, and verifies the smallest reproduction on the current tree; Main then examines the current tree, semantic diff, RED and GREEN evidence, root cause, shapes, device, determinism, evaluation or inference behavior, resource limits, serving correspondence, artifact provenance, and cross-slice interactions in an explicit MAIN REVIEW.
  10. [step-review] After MAIN REVIEW, the native reviewer independently reviews the Main-reviewed bounded diff and supplied evidence for root cause, model and data assumptions, reproducibility, serving parity, artifact safety, and operational risk without reading the project or running a command.
  11. [step-repair] Main validates each reviewer finding; for every material supported finding, task receives a bounded repair assignment, returns fresh affected evidence within the same artifact and compute limits, and Main refreshes verification and MAIN REVIEW before at most one fresh reviewer pass over the materially changed diff.
  12. [step-report] Report the diagnosed cause, plan and review dispositions, task deliveries, exact bounded commands and exits, resource and artifact limitations, fresh verification, unresolved serving risk, and every data or model artifact left untouched.
- Optional Agent candidates: `plan`, `task`, `reviewer`.
- Optional delegation ideas:
  - step-plan-review: plan independently reviews Main's supplied complete parallel deterministic repair plan, write sets, assignments, evidence seams, compute budget, and artifact boundary without editing files or running expensive jobs
  - step-task-batch: task receives all runnable independent ML slices for the wave in the same native tasks[] batch with exclusive write and resource budgets
  - step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the deterministic test, minimum production repair, same-command evidence, and protected-artifact exclusions
  - step-main-review: Main waits, integrates, verifies the current tree, and completes MAIN REVIEW before reviewer is assigned
  - step-review: reviewer independently audits only the Main-reviewed bounded diff and supplied ML evidence without project reads, commands, edits, or expensive jobs
  - step-repair: task receives only a Main-validated supported finding as a bounded repair and returns fresh affected evidence for Main re-review
- Quality checks:
  - exact environment and artifact identity, current failure evidence, data and tensor contract trace, deterministic reproduction, complete plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, root-cause regression, focused repair, current-revision execution, Main self-review, reviewer reconciliation, serving correspondence, and artifact provenance
- Scope notes:
  - Do not use a full training run when a small deterministic fixture can prove the repair.
  - Data, checkpoints, caches, and generated models remain outside the write scope unless explicitly included.
  - Slice count follows real independent vertical work, artifact dependencies, exclusive write ownership, bounded compute, and native capacity; one safe slice remains one task.
  - If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path.
- Risk notes:
  - ML debugging can consume substantial compute or mutate datasets and artifacts; use bounded fixtures and preserve provenance.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
