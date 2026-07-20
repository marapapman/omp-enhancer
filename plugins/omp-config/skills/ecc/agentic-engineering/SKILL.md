---
name: agentic-engineering
description: Use eval-first decomposition, dependency-aware parallel planning, and cost/risk analysis for agent-assisted engineering while preserving the current OMP workflow and authority boundaries.
---

# Agentic Engineering

Build a self-contained plan that makes dependencies, parallel execution, eval design, cost, and risk explicit before implementation.

## Current OMP boundary

- For a current OMP code task, preserve the existing lifecycle: Main discovers local and relevant external evidence, writes the detailed plan, gives it to plugin `plan`, delegates complete vertical slices through native `task` for task-owned TDD, integrates and records `MAIN REVIEW`, then sends the bounded reviewed diff and evidence to native `reviewer`.
- This Skill does not choose a model tier, Agent count, fanout, or completion authority. Main chooses among currently exposed Available Agents and native capacity using the loaded workflow and Skill guidance.
- Do not write a plan file or memory without explicit user authorization. Do not run a command, use git or gh, create a commit, push, or open a PR without explicit user authorization. Every write and external effect keeps its own authorization boundary.

## Method

1. Define the observable outcome, constraints, non-goals, and acceptance evidence.
2. Capture a baseline eval and its failure signature before proposing implementation.
3. Decompose into cohesive, independently verifiable vertical units. Keep each test with its production boundary and name dependencies and non-overlapping write sets.
4. Place independent units in the same candidate wave and dependent units in later waves. Treat this as plan data; Main makes dispatch decisions from current runtime availability.
5. For each unit record its dominant risk, cheapest uncertainty-reducing check, focused eval, regression surface, integration point, and estimated cost range.
6. Compare post-change evals with the baseline. Report regressions, ambiguous evidence, and remaining risk without converting them into a new lifecycle or completion rule.

Review invariants, edge cases, error boundaries, security assumptions, hidden coupling, and rollout risk. Prefer measurable evidence over model prestige, fixed staffing, or repeated unchanged attempts.
