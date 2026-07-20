---
name: blueprint
description: >-
  Design a self-contained engineering plan with evidence anchors, dependency
  edges, parallel work, evals, cost bounds, and risk controls. Use when Main
  has selected this planning method for a complex or multi-session objective;
  it supplements rather than replaces the current OMP workflow.
---

# Blueprint

Produce a self-contained plan whose dependencies, parallel work, evals, cost, and risk are understandable to a fresh assignee.

## Current OMP boundary

- For a current OMP code task, preserve the code lifecycle: Main performs discovery and writes the detailed plan, gives it to plugin `plan`, sends exclusive vertical slices to native `task` for task-owned TDD, integrates the current tree and records `MAIN REVIEW`, then gives the bounded diff and evidence to native `reviewer`.
- This Skill does not choose a model tier, Agent count, fanout, or completion authority. Main chooses from currently exposed Available Agents and native capacity at dispatch time.
- Do not write a plan file or memory without explicit user authorization. Return the plan in the response by default.
- Do not run a command, use git or gh, create a commit, push, or open a PR without explicit user authorization. Treat every write and external effect as a separately authorized action.
- Do not create another lifecycle, dispatch work, or turn review findings into permission to continue or finish.

## Planning method

1. **Frame the objective.** Record the outcome, non-goals, direct constraints, allowed effects, evidence anchors, assumptions, and acceptance evidence.
2. **Map dependencies.** Give each step an ID, inputs, outputs, local anchors, prerequisites, consumers, and a rollback or recovery note. Mark uncertain edges rather than inventing facts.
3. **Find parallel work.** Group runnable steps into waves only when their dependencies and write sets do not overlap. Keep dependent steps in later waves.
4. **Make assignments cold-startable.** Include the exact scope, relevant paths or artifacts, constraints, test or eval seam, expected evidence, and integration point. Do not prescribe an Agent that is not currently exposed.
5. **Design evaluation.** State the baseline, failure signature, focused check, broader regression check, and interpretation of each result. For code, keep tests with their production slice.
6. **Budget and de-risk.** Estimate effort or cost as ranges, identify the dominant risk per step, and name the cheapest discriminating check. Mark operations requiring new authorization.
7. **Review the plan.** Check coverage of acceptance criteria, DAG correctness, parallel write-set safety, integration ownership, observability, and unresolved assumptions. Findings amend the plan; they do not create a completion condition.

## Output

Return:

- objective, non-goals, constraints, and authorization assumptions;
- a dependency table with step, inputs, outputs, dependencies, write set, eval, risk, and evidence;
- parallel waves plus sequential integration points;
- an eval and cost summary;
- open questions and the conditions that would justify rebasing affected steps.

Keep the artifact proportional to the task. A planning method supplies structure, not runtime authority.
