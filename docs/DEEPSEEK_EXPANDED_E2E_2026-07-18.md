# DeepSeek Flash expanded E2E, 2026-07-18

This report expands the frozen prompt evaluation described in
[`DEEPSEEK_PROMPT_OPTIMIZATION.md`](DEEPSEEK_PROMPT_OPTIMIZATION.md). The run
uses real isolated OMP RPC sessions with `opencode-go/deepseek-v4-flash` and
does not edit the prompt, evaluator, fixtures, or expectations while any matrix
is running.

## Frozen inputs

Base commit: `e2202428df5718fd5e4f79ac6cd75eb856d33123`. The worktree contains the
current uncommitted optimization, so the following content hashes, rather than
the base commit alone, identify this evaluation:

```text
1dfa2fb73d8de5bbbf356d35fd236eb36ea19cdc9a9920446fb635b37713fd6f  plugins/omp-enhancer-core/index.js
92b02a6bc6c6a18bc942fb62c77cd533dd017c94e3a5fde2214d1d5523fc20c3  plugins/omp-enhancer-core/src/workflows/render-skill.js
862d938742f45cdddae4f773a8b1b6c329e00c9febb9269a9ab88680772631e4  scripts/e2e/workflow-events.mjs
acd8e45b72004c8d3bbacb6b6c16b6dd5b1256c780265a5cecb4b4a701336c0d  scripts/e2e/fixtures/deepseek-skill-discovery.json
a27a4bfcaadc490409c2b0864855fdf2b6b8c8ff12dccdd67c7f6f3130541979  scripts/e2e/fixtures/deepseek-subagent-willingness.json
2f44d9df269f96e69306190355bb5f2b8c073bdc649a7e0494d5b6a5af884c6b  scripts/e2e/fixtures/deepseek-advisor-stress.json
ef0774fb49434ebf213823540a861b442fc2773b1cd5264d106c89af9b7d1e66  scripts/e2e/fixtures/workflow-consolidation-installed.json
```

## Scale and acceptance

| Matrix | Scenarios | Repeats | Live sessions |
| --- | ---: | ---: | ---: |
| Skill discovery and domain-method use | 8 | 5 | 40 |
| Direct versus native fork behavior | 5 | 5 | 25 |
| Advisor assistance and isolation | 3 | 3 | 9 |
| Cross-domain workflow consolidation | 5 | 3 | 15 |
| Total | 21 | — | 89 |

The frozen fixture expectations remain authoritative. Aggregation additionally
separates semantic correctness, successful Skill use, Skill-before-project
ordering, workflow composition, fork width, assignment metadata, child-result
integration, negative controls, Advisor isolation, timeouts, and provider or
event-capture failures. A missing prompt trace is an observed failure, not a
runtime completion gate.

## Commands

```bash
npm run e2e:deepseek:skills -- --repeat 5 --worktree-plugins --output .omp/e2e-results/expanded-20260718-skills-r5
npm run e2e:deepseek:subagents -- --repeat 5 --worktree-plugins --output .omp/e2e-results/expanded-20260718-subagents-r5
npm run e2e:deepseek:advisor -- --repeat 3 --worktree-plugins --output .omp/e2e-results/expanded-20260718-advisor-r3
npm run e2e:deepseek -- --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json --repeat 3 --worktree-plugins --output .omp/e2e-results/expanded-20260718-consolidation-r3
```

## Run status

Stopped by user request on 2026-07-18 and not resumed. Of the planned 89 live
sessions, 84 produced complete `summary.json` records:

| Matrix | Completed | Planned | Aggregate report |
| --- | ---: | ---: | --- |
| Skill discovery and domain-method use | 40 | 40 | yes |
| Direct versus native fork behavior | 20 | 25 | no; interrupted during `five-plugin-natural-01` |
| Advisor assistance and isolation | 9 | 9 | yes |
| Cross-domain workflow consolidation | 15 | 15 | yes |
| Total | 84 | 89 | incomplete |

The interrupted subagent matrix has 20 complete session summaries; the partial
directory and five uncompleted sessions are excluded. Because the frozen run did
not finish, this document does not publish a combined pass rate or treat the
partial matrix as candidate-selection evidence.

The explicit `WORKFLOW PLAN` / post-load `WORKFLOW READY` TODO protocol was
implemented only after this run was stopped. None of the sessions in this report
evaluates that new candidate; later reruns are intentionally outside this dated report.
