# OMP Testing Enhancer marketplace workflow

Marketplace installs expose this guide as `/omp-testing-enhancer:test`.

This command explains the marketplace workflow. It is not the extension-registered `/test` command from `omp plugin link .`.

1. Assign `test-planner` to work read-only. It runs `omp_test_analyze` with the changed files and `omp_test_context` for each target to identify public and browser-observable behavior, existing tests, project patterns, `propertyPlan`, `apiPlan`, and an optional `browserPlan`.
2. When existing coverage or mutation reports are relevant, `test-planner` uses `omp_test_coverage_analyze` or `omp_test_mutation_context` as planning evidence.
3. `test-planner` returns a target-to-behavior `TEST_PLAN` with bounded test paths, fixtures, assertions, real project commands, and required evidence. It does not edit or execute.
4. After the parent confirms scope, assign `test-executor` to update only the planned tests and fixtures.
5. If `browserPlan` exists, `test-executor` calls `omp_test_browser_check` to collect console, pageerror, network, interaction, and visual evidence. Skip it when no `browserPlan` exists.
6. `test-executor` runs the expected test command through an explicit host-authorized shell tool call and records its real output and exit status. `omp_test_gate` never executes a command from arguments or config.
7. Assign `test-reviewer` after the diff and fresh execution evidence exist. It independently and read-only reviews plan coverage, public-behavior assertions, test-file scope, and current evidence without rerunning tests.
8. `test-reviewer` may run the compatibility tool `omp_test_gate` once for an advisory review of current-route host evidence, indirect-test, test-file-scope, browser-interaction, browser-visual, and test-command findings.
9. `test-reviewer` may finish with `omp_test_report` when a report is useful, then returns findings to the parent. The plugin does not schedule repair turns.

This workflow is advisory-only. Review findings are guidance for the agent, and route-scoped state exists only to keep observations from different user turns separate.

Suggested delegation:

- `test-planner`: `omp_test_analyze` → `omp_test_context` → optional coverage or mutation context → `TEST_PLAN`
- `test-executor`: update bounded tests and fixtures → optional `omp_test_browser_check` → host-authorized real test command → `TEST_EXECUTION`
- `test-reviewer`: independent read-only audit → optional `omp_test_gate` → optional `omp_test_report` → `TEST_REVIEW`
- parent: reconcile findings and decide whether any new authorized task is needed
