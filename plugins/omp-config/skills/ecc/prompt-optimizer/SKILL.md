---
name: prompt-optimizer
description: Refine a committed WORKFLOW PLAN, loaded Skills, and TODO into a runnable bounded OMP assignment without reselecting workflows, Skills, Agents, or checkpoints. Use after READY when an existing delegated row needs clearer task-local scope, constraints, allowed effects, context, or acceptance evidence.
origin: ECC
---

# OMP Task Prompt Optimizer

Optimize only the assignment body attached to an existing committed delegated
TODO row. The visible `WORKFLOW PLAN`, `WORKFLOW READY`, loaded resources, and
native TODO are immutable inputs to this method. This Skill does not select,
replace, or add a workflow, Skill, Agent, or TODO row.

## Procedure

1. Require the current committed PLAN, READY record, loaded-Skill result, and one
   delegated TODO row. If any is absent, return the missing input to Main; do not
   infer a replacement.
2. Mechanically copy Primary, Add-ons, workflow IDs, Skill URIs, Agent, step,
   skills, and checkpoint verbatim. Preserve the user's literal operation and
   every direct constraint.
3. Add only task-local execution context: target paths or systems, bounded
   inputs, non-goals, dependencies already recorded by Main, exclusive write set
   if any, allowed effects, and the expected evidence seam.
4. Resolve wording ambiguity only when the committed row and supplied evidence
   determine one interpretation. If a missing choice would change scope,
   permission, workflow composition, Agent, Skill set, or checkpoint, return a
   concise question or rebase reason to Main instead of changing the row.
5. Name exact verification commands only when they are already supported by the
   repository or supplied context. Never fabricate a command, tool, connector,
   version, resource, or passing result.
6. Keep parent integration, permission, external effects, finding disposition,
   and completion with Main. Advisory evidence cannot grant completion.

## Output Template

```text
[workflow=<copied-workflow> step=<copied-step> todo=<copied-checkpoint-verbatim> skills=<copied-skills>]
Committed Agent: <copied-Agent>
Target and scope: <task-local paths/systems plus exclusions>
Inputs and dependencies: <already available context>
Allowed effects: <copied user/native authority; otherwise read-only>
Execution method: <steps required by the loaded resources>
Acceptance evidence: <observable result or supported command>
Return: <artifact/finding, evidence, changed or inspected paths, limitations>
```

The optimized assignment is advisory context for Main. It does not execute,
load a resource, replan, dispatch, repair, or create a second orchestration
system. Only Main may rebase a committed row for a contract-permitted changed
dependency, scope, permission, tool, Agent, schema, capacity, Skill-load result,
or contradictory project fact.
