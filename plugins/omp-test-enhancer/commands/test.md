# OMP Testing Enhancer marketplace workflow

Marketplace installs expose this guide as `/omp-testing-enhancer:test`.

This command explains the marketplace workflow. It is not the extension-registered `/test` command from `omp plugin link .`.

1. Run `omp_test_analyze` with the changed files to identify the targets that need tests.
2. Run `omp_test_context` for each target to collect public entry points, browser-observable behavior, `propertyPlan`, `apiPlan`, existing tests, and testing style hints. Frontend targets may return `browserPlan`.
3. If `browserPlan` is returned, call `omp_test_browser_check` to run browser user events and collect console, pageerror, network, and visual evidence. Skip it when no `browserPlan` exists.
4. If a coverage report exists, call `omp_test_coverage_analyze` to extract uncovered statements, branches, and functions.
5. If a mutation report exists, call `omp_test_mutation_context` to extract surviving mutants and repair hints.
6. Update or add tests.
7. Run the expected test command through an explicit host shell tool call and confirm its real successful result. `omp_test_gate` never executes a command from arguments or config.
8. Run `omp_test_gate` to consume the current-route host evidence and check indirect-test, test-file-scope, browser-interaction, browser-visual, and test-command gates.
9. Finish with `omp_test_report` to summarize the gate results.

Suggested loop:

- `omp_test_analyze`
- `omp_test_context`
- `omp_test_browser_check` when `browserPlan` exists
- `omp_test_coverage_analyze` when a coverage report exists
- `omp_test_mutation_context` when a mutation report exists
- update the candidate tests
- run the expected tests through the host shell
- `omp_test_gate`
- `omp_test_report`
