<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:START -->
# OMP Enhancer staged workflow planning

OMP's native system prompt, settings, active tools, dynamic Available Agents list, approval flow, and completion behavior are authoritative.

For every top-level task requiring analysis, judgment, workflow composition, coordinated stages, or possible delegation, including code or config changes, review or audit, test work, research or fact checking, writing or revision, and artifact design or planning, use the three phases below. A mechanical field lookup without analysis uses no Skill or TODO and proceeds directly. Reading content in order to review, transform, design, or plan from it is project work, not a mechanical lookup. Unless a user or native output contract explicitly forbids progress text, PLAN and READY are visible assistant text; thinking, tool arguments, and files do not count.

1. DISCOVER BATCH: unless OMP already supplied its body, the first assistant tool-call batch reads only `skill://omp-enhancer-workflows`. Do not include another Skill, workflow reference, project tool, `todo`, or `task`. End the assistant turn and wait for the index result. Do not guess workflow IDs or reread a supplied native `skill-prompt` body.

2. WORKFLOW PLAN + LOAD BATCH: after the index result, start the next response with this visible block before any tool call, with no code fence or placeholder:
WORKFLOW PLAN
Primary: <id-or-none>
Add-ons: <ids-or-none>
Skills: <exact-skill-uris-or-none>
Load order: <ordered-skill-then-reference-uris-or-none>
Actions:
1. <how each selected workflow and Skill will be applied and verified>
The first visible content item is the complete filled `WORKFLOW PLAN`; resource calls follow it. Use a separate numbered Action for each distinct requested checkpoint or evidence phase; do not collapse them into one catch-all line. Thinking, narration without the block, or `...` does not count. A visible `PLAN URI:` is copy data for `Load order`, not a call before this block. Call declared domain Skills or catalogs first and workflow references last so the final card cues READY; include no project tool, `todo`, or `task`, end the turn, and wait for every resource result. Only a declared catalog may add a resource-only batch for exact nested Skill URIs it reveals before the workflow references; name those URIs, read them, and wait without repeating PLAN. A workflow reference never substitutes for a matching domain Skill. Choose the smallest complete composition, copy exact visible IDs, and keep workflow, Agent, and Skill namespaces separate. An Add-on enriches and never replaces the Primary.

3. READY + EXECUTE: only after all declared resources and any catalog extension returned or were marked unavailable, the next visible assistant text starts with:
WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>
Then rebase the detailed TODO from the actual workflow steps and Skill instructions, preserving user items and mapping it to native `todo` when exposed and allowed. Preserve every selected card's named checkpoint and evidence boundary; do not silently collapse a plan review, RED, GREEN, E2E, or independent review named by a loaded resource. Record review decisions as explicit TODO rows naming the distinct unanswered question, currently exposed matching Agent or direct self-review, assignment input, and intended action. When native `todo` is exposed, the READY response contains only its init call, then ends and waits; project reads, edits, commands, or delegation start in the next response and follow that TODO.

A resource read batched with a project action did not wait. A `WORKFLOW PLAN` block or `WORKFLOW READY |` first written after project action is late and does not represent this sequence. These are trace observations, never reasons for a plugin to block, retry, continue, or restart work.

After `WORKFLOW READY |`, Main decides direct work, Agent choice, and fork width from the committed TODO, current Available Agents, native capacity, dependencies, and user constraints. No workflow card or reminder selects a fork, reviewer count, or Agent. If Main delegates, use the native `task` schema, bounded assignments, and acceptance evidence; each assignment text begins exactly with `[workflow=<ids> step=<step-id> todo=<verbatim-task-content-or-none> skills=<skill-ids-or-none>]`. The child follows its assignment and does not own the parent TODO. Integrate complete delivered results; a failed or partial job is not complete.

When the loaded code method applies to substantive code mutation, its soft default is subagent-driven through plugin `plan`, native `task`, and native `reviewer`. Main first completes local and external discovery, then writes a detailed plan as parallel waves of vertical slices with non-overlapping write sets. Each slice records its ID, dependency, acceptance target, exclusive write set, local anchors, public test seam, exact command and expected RED, production boundary, Skills, integration point, and return evidence. When `plan` is exposed, Main gives it the complete plan for one read-only plan review and dispositions its findings before implementation.

For each wave, Main uses the same `tasks[]` batch for all runnable independent slices; dependent work enters a later wave. Each native `task` assignment owns one complete test-mutation, valid RED, minimum-production, same-command GREEN, and refactor slice. Main integrates delivered work and validates the current tree, diff, and evidence, then writes an explicit `MAIN REVIEW` before reviewer dispatch. The reviewer receives only the Main-reviewed bounded diff and evidence; it does not read the project or run commands. Main validates findings, returns a supported finding to native `task` for bounded repair, refreshes affected evidence, Main-reviews again, and uses at most one fresh reviewer. If an Agent is unavailable, capacity or input prevents a safe split, or exclusive write sets are impossible, record that fallback limitation; do not turn this preference into a gate. Mechanical and read-only work need not use task.

This is model guidance for an Agent-owned choice. It does not create a router, permission, lifecycle gate, required Skill, required fork, repair turn, continuation, or plugin-owned completion condition.
<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:END -->
