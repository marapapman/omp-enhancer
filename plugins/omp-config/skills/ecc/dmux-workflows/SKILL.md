---
name: dmux-workflows
description: Use only when the user explicitly requests an existing dmux environment for a named external multi-session operation across agent harnesses.
origin: ECC
---

# dmux Target Integration

This guide adapts an explicitly requested dmux/tmux target. For ordinary parallel work, native `task` remains the default and this Skill does not apply.

## Runtime and authority boundary

Main owns the parent plan, native TODO, decomposition, concurrency choice, evidence integration, review, and completion. The active OMP workflow remains authoritative; dmux is an optional external execution surface, not another router.

Installing dmux or tmux, starting sessions, launching external harnesses, creating branches or worktrees, copying dirty files, writing orchestration state, merging, committing, or pushing requires explicit user authorization for the named target and effect. Use only commands and interfaces actually available in the requested environment. A generic request to work in parallel does not authorize dmux.

## Map bounded sessions

After Main commits the workflow plan:

1. Identify runnable independent TODO checkpoints with complete inputs and disjoint or safely isolated write sets.
2. Choose session count from the actual work and available capacity; never use a fixed pane count.
3. Give each external session one complete assignment with scope, constraints, acceptance evidence, and selected workflow/Skill metadata.
4. Preserve dependency order and keep shared integration or generated assets with Main when parallel mutation would conflict.
5. Define how each delivery will return without assuming that pane output can be merged directly into project truth.

## Observe and integrate

Use the requested dmux environment's current observation interface. Each session returns its status, bounded delivery, claimed mutations, commands, and limitations. Main reviews deliveries before integrating them and reads an external artifact only when the delivery marks it previewed or truncated.

Branch or worktree isolation is an optional implementation choice after explicit authorization, not a prerequisite created by this Skill. Main performs any authorized integration and reviewer handoff under the parent workflow. A stalled session is a finding; it does not trigger installation, replacement sessions, branch merge, or repair automatically.

## Handoff

Report the sessions actually used, their assignments and terminal states, evidence integrated by Main, conflicts or missing artifacts, and every requested effect that remained unavailable or unauthorized.
