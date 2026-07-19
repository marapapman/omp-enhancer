# `code.dev` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `code.dev`

- Primary when: The central task is substantive software work outside the complete OMP plugin or OMP Enhancer self-development condition: inspect or plan a codebase, diagnose or debug a failure, implement or refactor behavior, author or run tests, repair a build, measure performance, or review code or a diff. The requested scope determines whether work is read-only or may mutate files.
- Reference steps:
  1. [step-1] Establish the requested outcome, mutation authority, acceptance criteria, repository instructions, dirty-tree boundary, exact failure or baseline evidence, and the smallest useful verification surface.
  2. [step-search-local] Search local code actively before proposing changes: locate entry points with fast repository search, trace callers and consumers, inspect adjacent tests and configuration, and distinguish repository source from generated, packaged, installed, or runtime truth.
  3. [step-search-external] When current library, toolchain, API, design, failure, or performance practice could change the decision and network use is available, search current official documentation and bounded community experience; keep external advice separate from local code evidence and record version and uncertainty.
  4. [step-plan] Main writes a detailed implementation and evidence plan for parallel execution in dependency-ordered waves of vertical slices, naming for every slice its ID, acceptance target, dependencies, exact files and non-overlapping write sets, local anchors, public test seam, exact focused command, expected valid RED, minimum production boundary, required Skills, integration point, and evidence to return; mark every slice runnable or blocked and independent or dependent.
  5. [step-plan-review] Use the currently exposed plan Agent to review and challenge Main's complete plan for parallel execution, including the plan assignment map, slice dependencies, write-set conflicts, inputs, and verification coverage, before any authorized production mutation.
  6. [step-plan-disposition] Main records every accepted, rejected, and unresolved plan finding, rebases only affected TODO rows, and freezes complete bounded assignments with exclusive write ownership before dispatch.
  7. [step-task-batch] For each wave, in the same native task tasks[] batch, Main sends all runnable independent slices, while dependent slices wait for their declared integration anchors and a single safe slice remains one task rather than manufactured parallelism.
  8. [step-task-tdd] Each task owns one complete vertical slice: make its public-behavior test mutation first, run the exact focused command and return a valid RED assertion, make the minimum production change within its exclusive write set, rerun the same command for GREEN, refactor only while green, rerun affected evidence, and return the bounded diff and exact command results.
  9. [step-main-review] Main waits for every task delivery, integrates the slices, resolves only evidenced conflicts, and runs focused and proportionate broader verification on the current tree; Main then examines the current tree, semantic diff, RED and GREEN evidence, acceptance coverage, scope, and cross-slice interactions in an explicit MAIN REVIEW before any reviewer assignment.
  10. [step-review] Only after MAIN REVIEW, the native reviewer independently reviews the Main-reviewed bounded semantic diff and supplied evidence without a project read or command, returning concrete findings or an explicit no-finding result without repair or completion authority.
  11. [step-repair] Main validates every reviewer finding against current evidence; for each material supported finding, Main gives task a bounded repair assignment, task repairs within an exclusive write set and returns fresh affected evidence, Main refreshes affected evidence and performs a fresh MAIN REVIEW, and at most one fresh reviewer reviews the materially changed Main-reviewed diff.
  12. [step-report] Report changed and inspected paths, plan and review dispositions, task deliveries, RED and GREEN evidence, exact verification results, external-source limitations, unresolved risk, and untouched user changes; perform commit, push, release, deployment, or upgrade only when explicitly authorized.
- Optional Agent candidates: `plan`, `task`, `reviewer`.
- Optional delegation ideas:
  - step-plan-review: plan independently challenges Main's supplied complete parallel plan, write sets, dependencies, assignment inputs, test seams, local and external anchors, and evidence boundary without editing files
  - step-task-batch: task receives every runnable independent vertical slice for the wave in the same native tasks[] batch, with one task per exclusive write set and no child ownership of the parent TODO
  - step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the public-behavior test mutation, valid RED, minimum production change, same-command GREEN, bounded refactor, and exact returned evidence
  - step-main-review: Main waits, integrates, verifies, and reviews the current tree, semantic diff, evidence, scope, and cross-slice interactions before reviewer is assigned
  - step-review: reviewer independently reviews the Main-reviewed bounded semantic diff and supplied evidence, does not read the project or run commands, and returns findings without repair or completion authority
  - step-repair: task receives only a Main-validated supported finding as a bounded repair assignment; Main refreshes affected evidence and re-reviews before at most one fresh affected reviewer pass
- Quality checks:
  - acceptance-to-file coverage, local entry-to-caller-to-test trace, current official and community evidence when decision-relevant, complete plan-review disposition, parallel vertical slices with non-overlapping write sets, task-owned RED-before-production and same-command GREEN evidence, Main self-review of the current semantic diff and cross-slice interactions, bounded reviewer evidence, finding reconciliation, and explicit authority and limitation reporting
- Scope notes:
  - A plan-only, diagnosis-only, test-analysis, or read-only review request does not authorize a production mutation; Main follows the user's requested outcome inside the same lifecycle.
  - When no meaningful test seam exists, state why and use the strongest available contract, build, static, replay, or runtime evidence without fabricating a RED.
  - The number of slices follows real independent work, dependencies, exclusive write ownership, and native capacity; do not manufacture parallelism or split tests from their production slice.
  - If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; missing delegation is not invented success.
  - This card is Agent-owned guidance, not a gate, router, fork mandate, completion controller, or self-repeating repair mechanism.
- Risk notes:
  - External examples can be stale or inapplicable, and broad code searches can create noise; record versions, prefer primary documentation for behavior, and use community reports as leads rather than local truth.
  - Overlapping write sets, hidden dependencies, or horizontal test and production assignments can invalidate parallel evidence; change wave boundaries or keep the complete vertical slice with one task.
  - Repeated review without materially changed input wastes context and can create churn; request a fresh review only after the plan, semantic diff, or evidence changed.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
