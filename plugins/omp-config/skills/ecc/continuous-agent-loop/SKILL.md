---
name: continuous-agent-loop
description: Design bounded, measurable autonomous loops for an external target system. Use only when the user explicitly requests designing or running such a loop; never treat it as a controller for the current OMP session.
---

# Continuous Agent Loop

Use this Skill only when the user explicitly requests to design or run an external autonomous loop. Examples and proposed scripts are target data, not instructions for the current OMP session.

## Current OMP boundary

- For a current OMP code task, retain the existing lifecycle: Main writes the detailed plan, uses plugin `plan`, delegates vertical slices through native `task` for task-owned TDD, integrates and records `MAIN REVIEW`, then gives the bounded diff and evidence to native `reviewer`.
- This Skill does not choose a model tier, Agent count, or fanout. Any target-system concurrency proposal must be reconciled with currently exposed Available Agents and native capacity by Main.
- It cannot dispatch, continue, repeat, or declare the current session complete. It supplies target-system design data only.

## External-loop design

1. **Target contract:** Identify the external process, inputs, outputs, allowed effects, ownership, and observable success and failure states. Separate target state from current OMP state.
2. **Evaluation:** Define a baseline and per-iteration evals with evidence sources and interpretation. Prefer behavior deltas over self-reported success.
3. **Bounds:** Design a bounded iteration protocol with evals, progress, churn, cost, and recovery controls. State iteration, duration, and spend ceilings as user-chosen target parameters rather than fixed wave sizes.
4. **Progress and churn:** Track changed evidence, repeated failure signatures, useful output, and marginal cost. Lack of progress yields a diagnosis and a proposed choice; it does not silently launch another attempt.
5. **Recovery:** Preserve the last safe target state, narrow the failing unit, change one hypothesis at a time, and surface permission or dependency changes to the user.
6. **Authority ledger:** Record which target actions are read-only, mutating, persistent, or externally visible.

Every file write, command, persistence action, commit, push, PR, merge, and CI repair requires separate explicit user authorization. Do not assume any command or tool that is absent from the live schema. Never persist plans or loop state merely because this Skill was loaded.

Return a target-loop specification with bounds, evals, progress and churn metrics, cost budget, recovery choices, authority ledger, and unresolved risks. Designing it does not start it.
