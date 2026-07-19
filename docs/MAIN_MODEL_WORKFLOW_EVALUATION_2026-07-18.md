# Main Model Workflow Evaluation, 2026-07-18

This report compares exact `opencode-go/deepseek-v4-flash` and exact
`opencode-go/mimo-v2.5` as Main on the same current-worktree workflow and Skill
matrix. It records model behavior, not a plugin guarantee or a runtime gate.

Historical format note: this run evaluated the former single-line PLAN tuple.
The current exact block contract is documented in `ARCHITECTURE.md`; do not
compare its new-format scores directly with this report without rerunning the matrix.

## Method

Both runs used:

- the same five scenarios and fixtures;
- `thinking=high`;
- current worktree plugins in isolated OMP homes;
- two repetitions per scenario;
- the same strict event evaluator.

The four non-mechanical scenarios cover English writing, local fact checking,
Docker Compose planning, and XLSX planning. The fifth is a mechanical heading
lookup that must use no workflow marker, Skill, TODO, or Agent.

The strict evaluator requires event evidence for an index-only first assistant
tool batch, a visible `WORKFLOW PLAN | ...` before any resource or project call,
a resource-only load batch, a visible `WORKFLOW READY | ...` after all resource
results and before project tools, and the required domain Skill. It also rejects
assistant model or transport errors instead of misclassifying them as workflow
or fork refusal.

## Result

| Model | All scenarios | Non-mechanical | Mechanical negative | Decision |
| --- | ---: | ---: | ---: | --- |
| DeepSeek v4 Flash | 5/10 | 3/8 | 2/2 | Retain as packaged Main default |
| MiMo v2.5 | 3/10 | 1/8 | 2/2 | Keep as an explicit alternative |

Per scenario:

| Scenario | DeepSeek | MiMo |
| --- | ---: | ---: |
| English writing | 0/2 | 0/2 |
| Local fact checking | 1/2 | 0/2 |
| Docker Compose planning | 2/2 | 1/2 |
| XLSX planning | 0/2 | 0/2 |
| Mechanical heading lookup | 2/2 | 2/2 |

Preparation evidence across the eight non-mechanical runs:

| Evidence | DeepSeek | MiMo |
| --- | ---: | ---: |
| Workflow index alone in the first tool batch | 8/8 | 4/8 |
| PLAN in the correct event interval | 5/8 | 1/8 |
| No resource/project mixed batch | 7/8 | 5/8 |
| READY in the correct event interval | 4/8 | 1/8 |
| Required domain Skill check satisfied | 6/8 | 2/8 |

Latency was not the deciding factor. DeepSeek had a 34.7 s median and 43.1 s
p90. MiMo had a 30.1 s median but a 74.0 s p90. In this small sample MiMo was
slightly faster at the median but materially less predictable at the tail and
substantially less compliant with staged workflow preparation.

The retained prompt improved DeepSeek directionally against the previous strict
candidate snapshot: index-only preparation rose from 4/12 to 8/8,
correctly placed PLAN from 3/12 to 5/8, correctly placed READY from 3/12 to
4/8, and required-domain-Skill evidence from 5/12 to 6/8. The task counts differ,
so this is a directional regression check rather than a statistical claim.

## Decision and remaining variance

At the time of this run, the packaged template was:

```yaml
modelRoles:
  default: opencode-go/deepseek-v4-flash:medium
  advisor: openai-codex/gpt-5.6-luna:xhigh
```

The current template now uses `opencode-go/deepseek-v4-flash:max`; that later
configuration change is outside this dated comparison. The equal-budget comparison
used `high` to compare model behavior. It supports
retaining the DeepSeek model identity; it does not by itself justify changing
the packaged thinking level or claiming deterministic compliance. MiMo remains
available through an explicit model selection and receives the same scoped
three-phase compatibility reminder, but the plugin does not switch users to it.

Residual failures are still stochastic. DeepSeek sometimes placed READY after a
project read, skipped XLSX, or loaded one unrelated extra format Skill. MiMo more
often mixed the index, resources, and project action or skipped the owning Skill.
These remain prompt-quality findings. They are not reasons to add a hard router,
block a tool call, force a fork, retry a session, or make the evaluator a runtime
completion controller.

## Fork probe status

A same-day current-prompt fork probe was attempted after the model comparison,
but both model runs returned an empty zero-token assistant error before model
generation: `Was there a typo in the url or port?`. Those trajectories are an
external model/transport failure and are excluded from model-behavior results.
The evaluator now surfaces that cause explicitly. A fork comparison is valid
only after the endpoint produces a normal assistant trajectory; do not count a
zero-token provider error as refusal to delegate.

## Reproduction

Run the same matrix twice rather than describing the runner as a paired A/B
orchestrator:

```bash
npm run e2e:main:skills -- \
  --model opencode-go/deepseek-v4-flash --thinking high --worktree-plugins \
  --scenario natural-writing-en --scenario natural-fact-check \
  --scenario natural-docker-compose --scenario natural-xlsx \
  --scenario natural-negative-read --repeat 2 \
  --output .omp/e2e-results/model-final-deepseek-r2
npm run e2e:main:skills -- \
  --model opencode-go/mimo-v2.5 --thinking high --worktree-plugins \
  --scenario natural-writing-en --scenario natural-fact-check \
  --scenario natural-docker-compose --scenario natural-xlsx \
  --scenario natural-negative-read --repeat 2 \
  --output .omp/e2e-results/model-final-mimo-r2
```

The saved reports for this comparison are:

```text
.omp/e2e-results/model-final-deepseek-r2/report.json
.omp/e2e-results/model-final-mimo-r2/report.json
```

Future runner reports include their effective model and thinking profiles so a
result directory is not the only source of model provenance.
