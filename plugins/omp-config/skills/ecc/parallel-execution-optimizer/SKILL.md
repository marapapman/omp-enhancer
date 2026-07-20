---
name: parallel-execution-optimizer
description: Use after Main commits a workflow when advisory dependency and write-surface analysis could identify safe parallel lanes without taking over orchestration.
origin: ECC
---

# Parallel Execution Optimizer

Use this Skill after Main has selected and committed a workflow. It reads the
currently committed workflow and parent TODO, then returns advisory lane findings
for repo inspection, file reads, API checks, browser checks, build/test lanes, or
other independent evidence checkpoints.

It does not replace the parent TODO, dispatch Agents, set fixed fanout, or create
a parallel orchestration layer. Native OMP owns current Available Agents, live
Agent availability, capacity, tools, permissions, and completion. Main owns Agent
selection, concurrency, dependency waves, integration, and finding disposition.

Host configuration, worktree creation or deletion, a background process, or a
deploy is outside this advisory analysis. Each requires separate explicit user
authorization and native permission. This Skill does not start tasks, commands,
services, worktrees, deployments, or native `task` calls.

## Core Pattern

Map the committed work into a dependency graph before Main acts.

1. Copy the objective and done signal from the committed plan and TODO.
2. Map existing checkpoints into candidate lanes without adding assignments.
3. Mark each lane as independent, dependency-bound, or write-conflicting.
4. Identify reads or checks that Main could safely batch.
5. Record each write surface by file, branch, service, or dataset.
6. Recommend an integration order backed by compatibility evidence.
7. Return a verification table, not a vague speed claim.

## Lane Matrix

For a large committed checkpoint set, return a compact matrix:

```text
Lane | Can run in parallel? | Write surface | Risk | Verification
Repo scan | yes | none | low | rg/git status outputs
Backend patch | maybe | src/api | medium | unit tests
Frontend patch | maybe | app/components | medium | browser screenshot
Deploy readback | after build | remote service | high | live URL + logs
```

Only recommend parallel lanes when their write surfaces do not collide. Main
compiles any recommendation against current Available Agents, native capacity,
dependencies, user constraints, and the committed TODO.

## Execution Rules

- Recommend batched file reads, searches, status checks, and metadata queries
  only when the committed checkpoints are independent.
- Treat an isolated worktree as an optional write-separation finding, not as
  permission to create, mutate, merge, or delete one.
- For a long-running command already authorized by the user and native host,
  identify a polling dependency; Main decides whether and how to run it.
- If evidence reveals a new dependency or write conflict, report the affected
  lanes so Main can decide whether a permitted TODO rebase is needed.
- Never infer authority for destructive commands, migrations, shared writes,
  background services, or customer-impacting deploys.

## Output Shape

Use this when reporting:

```text
Parallel execution result:
- Candidate independent lanes: <count and checkpoint IDs>
- Dependency-bound lanes: <count and dependency IDs>
- Write conflicts: <none or exact surfaces>
- Fast path found: batched repo scan + focused tests
- Suggested verification: <evidence commands or observations>
```

## Failure Modes

- More concurrency that creates conflicting edits.
- Benchmarking the tool instead of the task.
- Treating "fast" as done before correctness is proven.
- Omitting a polling dependency for an already-authorized running session.
- Hiding skipped checks behind a success summary.
