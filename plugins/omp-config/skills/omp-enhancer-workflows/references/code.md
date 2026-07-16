# code workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.

## `code.plan`

- Use when: The deliverable is an implementation, repair, migration, or test plan rather than the change itself.
- May compose with: `code.review`, `security.review`.
- Reference steps: (1) [step-1] Inspect minimal implementation and test context. (2) [step-2] Define scope and invariants. (3) [step-3] Decompose implementation and verification. (4) [step-4] Record dependencies and risks. (5) [step-5] Deliver an actionable plan without executing it.
- Optional skills: `brainstorming`, `writing-plans`.
- Optional Agent candidates: `explore`, `plan`.
- Optional delegation ideas: step-1: explore performs bounded read-only inspection of the implementation and test context; steps-2-5: plan owns the complete advisory implementation and verification plan without editing files or running tests.
- Quality checks: scope completeness, dependency order, and verification correspondence.
- Scope notes: Planning is advisory and does not imply permission to edit files or run tests.
- Risk notes: none.

## `code.dev`

- Use when: The user authorizes a code or configuration change, usually with verification.
- May compose with: `code.debug`, `code.test`, `code.review`, `security.review`, `omp.plugin`.
- Reference steps: (1) [step-1] Inspect affected code, tests, and conventions. (2) [step-2] Plan the smallest coherent change. (3) [step-3] Write or update focused tests where appropriate. (4) [step-4] Implement. (5) [step-5] Verify and review the semantic diff.
- Optional skills: `brainstorming`, `test-driven-development`, `subagent-driven-development`, `verification-before-completion`.
- Optional Agent candidates: `explore`, `plan`, `implementation-task`, `reviewer`.
- Optional delegation ideas: step-1: explore performs bounded read-only inspection of affected code, tests, callers, and conventions; step-2: plan owns the bounded implementation and verification plan without editing files; steps-3-4: implementation-task owns the planned implementation and focused tests within its assigned scope; step-5: reviewer independently audits the semantic diff, tests, scope, and evidence without taking over integration.
- Quality checks: focused tests, behavior preservation, semantic diff review, and user-scope compliance.
- Scope notes: Release or deployment is a separate step when the user requests it.
- Risk notes: none.

## `code.debug`

- Use when: The task is to reproduce, localize, or explain a concrete failure or mismatch.
- May compose with: `code.dev`, `code.test`, `code.review`.
- Reference steps: (1) [step-1] Reproduce or localize the failure. (2) [step-2] Trace the concrete path and runtime truth. (3) [step-3] Form and test hypotheses. (4) [step-4] Explain the root cause with evidence. (5) [step-5] Compose code.dev only when a fix is requested.
- Optional skills: `diagnose`, `systematic-debugging`.
- Optional Agent candidates: none suggested.
- Optional delegation ideas: steps-1-4: keep diagnosis with the main agent; compose code.dev, code.test, security.review, or another specialized workflow before delegating a checkpoint to its exact listed role.
- Quality checks: reproducible evidence, cause rather than symptom, and installed-versus-source consistency.
- Scope notes: Implementation is a follow-on step when a fix is in scope.
- Risk notes: none.

## `code.test`

- Use when: The task requires designing, adding, running, or interpreting tests.
- May compose with: `code.plan`, `code.dev`, `code.debug`, `code.review`, `omp.plugin`.
- Reference steps: (1) [step-1] Confirm the authorized test scope, project instructions, target revision, and whether the task requires test design, authoring, execution, or interpretation. (2) [step-2] Have test-planner inspect public behavior, existing tests, risk, fixtures, real project commands, and available browser, coverage, or mutation context, then produce a target-to-behavior and evidence plan without editing files or running tests. (3) [step-3] When authoring is in scope, have test-executor make only the planned bounded test-file and test-fixture changes through public behavior; route any required production-code change through code.dev. (4) [step-4] Have test-executor run only host-authorized real project commands and collect fresh route-specific execution, browser, coverage, or mutation evidence as applicable; omp_test_gate never executes commands. (5) [step-5] Have test-reviewer independently review the plan, test diff, public-behavior coverage, scope, and current evidence without editing files or rerunning tests, and return advisory findings rather than completion permission. (6) [step-6] Have the parent reconcile the independent review, report exact commands, exit status, failures, coverage limitations, and unreviewable evidence honestly, and never schedule an automatic repair turn.
- Optional skills: `test-driven-development`, `verification-before-completion`.
- Optional Agent candidates: `test-planner`, `test-executor`, `test-reviewer`.
- Optional delegation ideas: step-2: test-planner produces the target-to-behavior and evidence plan without editing files or running tests; step-3: test-executor owns bounded test and fixture changes when authoring is in scope; step-4: test-executor runs only host-authorized commands and records fresh execution evidence; step-5: test-reviewer independently audits the plan, test diff, public-behavior coverage, and current evidence without editing files or rerunning tests.
- Quality checks: target-to-behavior plan coverage, public-behavior assertions, test-only change scope, command-to-target correspondence, current-revision non-empty execution, exact exit status, browser and coverage evidence when applicable, failure visibility, independent review, and explicit limitations.
- Scope notes: The user-provided target list defines the intended testing scope; The planner and reviewer are read-only; the executor may change only authorized tests and fixtures, and production changes require composition with code.dev; All agent and omp_test_gate conclusions are advisory evidence, not execution authority or completion permission.
- Risk notes: none.

## `code.review`

- Use when: The user asks for a read-only code review, bug audit, regression audit, or diff review.
- May compose with: `code.plan`, `code.debug`, `code.test`, `security.review`.
- Reference steps: (1) [step-1] Inspect requested paths and surrounding contracts. (2) [step-2] Trace concrete callers and failure paths. (3) [step-3] Validate findings against tests or runtime evidence. (4) [step-4] Report prioritized findings with file and symbol evidence.
- Optional skills: `diagnose`, `verification-before-completion`.
- Optional Agent candidates: `explore`, `reviewer`, `omp-target-auditor`.
- Optional delegation ideas: steps-1-2: explore performs bounded read-only inspection of requested paths, surrounding contracts, callers, and failure paths; steps-3-4: reviewer independently validates and reports patch-anchored findings when the assignment supplies a diff, commit, or pull request; steps-3-4: omp-target-auditor independently validates and reports target-anchored findings when the assignment names an existing bounded target without a diff.
- Quality checks: finding-to-code evidence, severity rationale, regression impact, and explicit hypotheses.
- Scope notes: Speculative concerns should be labeled as hypotheses.
- Risk notes: none.

## `code.build`

- Use when: A compiler, type checker, linker, bundler, package, or build command fails and the user wants diagnosis or an authorized repair.
- May compose with: `code.debug`, `code.dev`, `code.test`, `code.review`.
- Reference steps: (1) [step-1] Capture the exact build command, target revision, environment, current failure evidence, and the smallest reproducible target. (2) [step-2] Inspect the relevant toolchain, configuration, dependency, source, and generated-file boundaries without changing them. (3) [step-3] Plan the smallest repair and the focused regression evidence that will distinguish the root cause from downstream symptoms. (4) [step-4] When repair is authorized, write or update a focused failing test where a meaningful seam exists, then implement only the planned change. (5) [step-5] Rerun the exact failing build command and the smallest relevant test set on the current revision, recording exit status and limitations. (6) [step-6] Independently review the semantic diff, build evidence, generated artifacts, dependency changes, and scope before reporting.
- Optional skills: `build-toolchain-diagnostics`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`.
- Optional Agent candidates: `explore`, `plan`, `implementation-task`, `reviewer`.
- Optional delegation ideas: steps-1-2: explore collects bounded read-only build, toolchain, configuration, dependency, and source evidence; step-3: plan owns the minimal repair and verification plan without editing files; step-4: implementation-task owns only the authorized focused test and implementation changes; step-6: reviewer independently audits the diff and current build and test evidence.
- Quality checks: exact build command correspondence, current failure evidence, root-cause evidence, focused regression coverage, successful current-revision rerun, semantic diff review, and explicit limitations.
- Scope notes: Do not upgrade dependencies, clear shared caches, regenerate broad artifacts, or modify lockfiles unless the evidence and user-authorized repair require it; Compose code.debug for diagnosis-only work, code.dev for production changes, and code.test for independently planned test execution.
- Risk notes: Toolchain and dependency changes can widen the diff or invalidate reproducibility; keep them evidence-driven and reversible.

## `performance.optimize`

- Use when: The user wants a measured performance improvement with a preserved correctness contract rather than an unmeasured cleanup.
- May compose with: `code.plan`, `code.dev`, `code.test`, `code.review`.
- Reference steps: (1) [step-1] Define the operation, metric, correctness gate, representative input, baseline environment, and bounded search budget. (2) [step-2] Measure a reproducible baseline and profile the actual bottleneck before proposing source changes. (3) [step-3] Plan one evidence-backed optimization hypothesis at a time with rollback and regression checks. (4) [step-4] Implement the smallest authorized variant while preserving the correctness gate and avoiding unrelated refactors. (5) [step-5] Repeat the benchmark under the same conditions, run correctness tests, and compare the result against baseline and measurement noise. (6) [step-6] Independently review the profiling evidence, semantic diff, correctness results, claimed delta, reproducibility, and rollback.
- Optional skills: `benchmark`, `benchmark-optimization-loop`, `test-driven-development`, `verification-before-completion`.
- Optional Agent candidates: `explore`, `plan`, `implementation-task`, `reviewer`.
- Optional delegation ideas: steps-1-2: explore gathers bounded read-only baseline, benchmark, profile, and relevant source context; step-3: plan owns the measurable optimization and rollback plan without editing files; step-4: implementation-task owns only the selected bounded optimization variant and focused tests; step-6: reviewer independently audits the baseline, profile, diff, correctness, claimed delta, and reproducibility.
- Quality checks: reproducible baseline, profile-backed bottleneck, bounded hypothesis, same-condition comparison, correctness preservation, repeated performance delta, semantic diff review, and rollback evidence.
- Scope notes: Do not claim a global optimum from a bounded search or accept a faster result that fails the correctness gate; Load stack-specific performance skills only when they match the measured bottleneck.
- Risk notes: Benchmarks can mutate data, consume substantial compute, or mislead when environments differ; bound cost and record conditions.
