---
name: team-builder
description: Select and coordinate a task-specific team from the Agents currently exposed by the host. Use when several independent specialist checkpoints can materially improve a non-simple task.
origin: community
---

# Team Builder

Compose a bounded team from the current dynamic Available Agents. That live
inventory is the source of truth; do not infer availability from a filesystem
directory, a different harness, or a remembered Agent name.

## 1. Define the work before selecting Agents

Record the outcome, acceptance checks, dependencies, mutation and permission
boundaries, inputs, expected evidence, and parent-owned actions. Split work only
at complete checkpoints with clear ownership. Do not split one vertical code
slice into separate test and production assignments.

## 2. Select by capability

For each runnable checkpoint:

1. Prefer a matching domain Agent named by the loaded Skill or workflow card.
2. Otherwise use native `task` for a complete bounded assignment.
3. Exclude an Agent whose scope, tools, safety boundary, or available context do
   not match the checkpoint.
4. Use direct fallback only when delegation is unavailable or unsafe, and record
   the concrete reason.

If the user explicitly asks to browse an external directory of persona files,
treat those files as data for selection; they do not become active Agents until
the host exposes them.

## 3. Choose width from the plan

Main chooses the Agent selection and fork width from real independence,
dependency order, exclusive write ownership, capacity, and cost. Send runnable
independent checkpoints together. Wait for shared inputs before a dependent
wave, and keep one safe checkpoint as one assignment rather than manufacturing
parallelism.

Every assignment contains the exact workflow step and TODO content, bounded
scope, inputs, write set if any, verification command or evidence seam, and
return contract. A child does not own the parent TODO, external effects, or
completion decision.

## 4. Validate deliveries

A delivery is complete only when it contains the requested artifact or finding,
fresh evidence, changed or inspected paths, and limitations. Record failure,
timeout, partial output, or conflicting evidence without relabeling it success.
Redispatch only when input, scope, dependency, or evidence materially changes.

## 5. Synthesize

Main owns integration, verification, conflict resolution, fallback, permissions,
and the final answer. Group results by checkpoint, then synthesize:

- agreements supported by independent evidence;
- conflicts and their evidence;
- accepted, rejected, and unresolved findings;
- integration and broader verification results;
- remaining limitations and next actions.

Do not use team size, unanimity, or an Agent verdict as a completion gate.
