---
name: claude-devfleet
description: Use only when the user explicitly requests an existing Claude DevFleet deployment and its currently exposed connector for a named multi-agent coding operation.
origin: community
---

# Claude DevFleet Target Integration

This guide adapts an explicitly requested external DevFleet target. For ordinary parallel work, native `task` remains the default and this Skill does not apply.

## Runtime and authority boundary

Main owns the parent plan, native TODO, task decomposition, Agent width, evidence integration, review, and completion. Use only DevFleet capabilities actually exposed by the current host; names and schemas from another installation are not contracts.

Connecting or installing DevFleet, creating a project or worktree, dispatching a mission, changing a branch, merging, cancelling work, or publishing results requires explicit user authorization for that target and effect. A request to explain, inspect, or plan a DevFleet setup does not authorize execution.

Do not enable unattended dependency dispatch or merging as a side effect of planning. External capacity does not choose fork width, and a DevFleet report is delivery evidence rather than proof that its files or tests are correct.

## Plan the mapping

After Main has selected and loaded the active workflow:

1. Map each proposed external mission to one complete parent TODO checkpoint.
2. Record exact scope, inputs, dependencies, write set, acceptance evidence, and rollback or recovery notes.
3. Keep dependent missions ordered; group only runnable independent missions.
4. State which currently exposed DevFleet actions would be needed and which effects still need authorization.
5. Preserve the selected workflow and Skill metadata in each mission assignment.

Do not create a second DevFleet-owned plan when Main's current plan already supplies the required checkpoints.

## Execute only the authorized portion

When the user has authorized dispatch and the live connector is available, Main chooses a capacity-aware mission set and submits only complete assignments. Monitor through the connector's current status mechanism without a fixed polling interval or blocking wait. Do not start a dependent mission until its required delivery is available and reviewed.

For every completed mission, capture:

- mission identity and terminal status;
- bounded delivery text or an explicitly marked artifact preview;
- claimed files and commands;
- failures, conflicts, and unresolved assumptions.

Main verifies integration anchors, performs visible review, and uses a reviewer according to the parent workflow. An incomplete or failed mission returns a finding; it does not trigger automatic redispatch, merge, or repair.

## Handoff

Report the authorized DevFleet actions taken, mission statuses, deliveries used, evidence independently verified by Main, and any effect that was unavailable or left unauthorized.
