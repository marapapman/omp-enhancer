<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:START -->
# OMP Enhancer staged workflow planning

OMP's native system prompt, settings, active tools, dynamic Available Agents, approval flow, and completion behavior are authoritative. This guidance never routes, blocks, grants permission, starts a task, or decides completion.

For every top-level task requiring analysis, judgment, workflow composition, coordinated stages, or possible delegation, use:

`DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY`

A verbatim field or heading lookup without analysis is DIRECT: use no workflow Skill or TODO. Review, correction, comparison, verification, design, transformation, planning, research, and writing are PROJECT even when the target is small.

## DISCOVER

Only a native `skill-prompt` body named `omp-enhancer-workflows` counts as the supplied index. `AGENTS.md`, `CLAUDE.md`, managed workflow context, an Available Skills list or description, and any other Skill body do not count. If that exact native body was supplied, DISCOVER is complete: do not reread it; emit PLAN next. Otherwise the first PROJECT tool batch reads only `skill://omp-enhancer-workflows`, ends, and waits. Do not combine that read with another Skill, workflow reference, project tool, `todo`, or `task`.

## DECLARE

Use the loaded index to choose one central Primary and only independently matched requested operations or outputs as Add-ons. Primary and Add-ons are workflow IDs copied verbatim from the loaded index; Skill names are never workflow IDs. If the index is not loaded, return to DISCOVER instead of inferring an ID. Internal phases of the Primary are not Add-ons. Choose the smallest set of domain Skills that owns a requested method, evidence rule, verdict, or format. A hint is never a call by itself.

The next response puts the filled PLAN in visible assistant text before any resource call; a resource call without that visible PLAN does not complete DECLARE. Its byte 0 is `W`:

WORKFLOW PLAN
Primary: <id-or-none>
Add-ons: <ids-or-none>
Skills: <exact domain Skill/catalog URIs-or-none>
Load order: NOW=[<chosen non-supplied Skill/catalog URIs-or-none>] THEN=[<Add-on PLAN URIs; Primary PLAN URI last-or-none>]
Actions:
1. LOAD: <NOW, revealed extensions, THEN, and waits>
2. COMMIT: After all resources, emit READY + detailed TODO from loaded steps only; end and wait; zero project tools.
3. SPLIT + EXECUTE: After READY wait, apply loaded defaults/checkpoints to current Agents and dependency order; Delegate or record one permitted fallback.
4. VERIFY: <requested acceptance evidence and parent delivery integration>

`Skills` lists exact domain Skill/catalog URIs only; workflow references appear only in `THEN`. Index `D` entries are top-level exact URIs and `C` entries are enumerated nested ECC exact URIs; selected D/C entries copy directly into `Skills` and `NOW`, while `skill://ecc-skill-catalog` is only for unlisted niche discovery. `NOW` copies the chosen Skill/catalog URIs whose bodies were not supplied by OMP, in the same order. `THEN` copies selected Add-on `PLAN URI` values in order and the Primary `PLAN URI` once and last. READY and delegated metadata use bare Skill IDs. Fill at least these four detailed Actions and give each additional requested evidence checkpoint its own Action.

COMPILE (soft): loaded `subagent-driven` + complete input + safe checkpoint + visible matching Agent => Delegate row; otherwise `fallback=<one matched permitted limitation>`. PLAN defers this final disposition until the card loads; no plugin enforces it. A selected `writing.en` or `writing.zh` with a named target, requested operation, preservation constraints, acceptance evidence, and visible language roles compiles to writer first after READY, checker after writer delivery, and parent VERIFY; Main does not pre-read the target.

The PLAN response reads exactly `NOW` once and waits. When `NOW=[none]`, it reads exactly `THEN` once and waits. It contains no project tool, `todo`, or `task`.

## LOAD

A loaded declared Skill or catalog may reveal an exact linked Skill URI needed by the selected method. Make the first visible text of that response:

`RESOURCE EXTENSION | source=<loaded-exact-skill-uri> | reads=<revealed-exact-skill-uris>`

Read exactly those URIs once in written order, end, and wait. Allow at most three extension batches: no more than two catalog hops plus one linked-method batch. The source must already be loaded and visibly reveal every URI; never guess, leave its namespace, or reread a loaded URI. After extensions, read `THEN` once in a final reference-only batch and wait. If `NOW=[none]` caused `THEN` to load with PLAN, do not load it again.

Copy a visible Skill name `x` to literal `skill://x` for the resource resolver. Bare `x` is a project path. Project `.agents/skills`, personal `~/.agents/skills`, or any one directory is not the complete runtime inventory. Mark a Skill unavailable only after its exact declared `skill://...` resolver call fails. A native `skill-prompt` body is already loaded: keep its exact URI in PLAN `Skills` and its bare ID in READY, omit it from `NOW`, and never reread it.

Project tools start only after the READY + TODO response ends and its results return. The user's explicit source-language description is sufficient before then. If a named writing target's body language is genuinely unknown, select only the visible `writing.pending` option. After its initial READY/TODO wait, make one narrow language-only target read, then emit one replacement PLAN: choose `writing.en` or `writing.zh`, retain format Add-ons, put only new language Skills in NOW, put the language Primary reference last in THEN, load and wait, then emit replacement READY/TODO and wait. If still ambiguous, ask the user; never repeat or guess.

## COMMIT

After all declared resources return or are marked unavailable, the next response is the filled READY plus native TODO init. Its byte 0 is `W`:

`WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`

Rebase a detailed TODO from the loaded card steps and Skill instructions. Apply the loaded-card soft compiler: `subagent-driven` plus complete input, a safe checkpoint, and a visible matching Agent produces one exact Delegate row for that checkpoint; otherwise record one matched permitted fallback. Parent VERIFY rows remain separate. Preserve every named plan review, RED, GREEN, E2E, independent review, and parent verification checkpoint. Freeze `W=<Primary,Add-ons>` and `S=<bare loaded Skill IDs>`; later delegated TODO and task metadata copy W/S without re-inferring them.

When native `todo` is exposed and allowed, the READY response calls only TODO init, ends, and waits. Each delegated item is exactly:

`Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`

The checkpoint is one complete metadata-safe line without `]` or reserved field markers. Other rows state parent ownership and VERIFY work. If delegation cannot safely proceed, the affected row records `fallback=<concrete-permitted-limitation>`.

## SPLIT, EXECUTE, VERIFY

Main chooses direct work, Agent, and fork width from the committed TODO, current Available Agents, native capacity, dependencies, and user constraints. Every non-simple loaded card is soft `subagent-driven`; `agentic.simple` uses zero `task` calls, and `writing.pending` first completes its one-time composition transition.

For a non-simple card, commit at least one safe complete checkpoint to a currently visible matching Agent when assignment input is complete. Prefer a domain Agent named by the owning Skill or selected card; use generic `task` only as fallback. Batch runnable independent checkpoints and keep dependent checkpoints in later waves. After all parent-owned pre-dispatch prerequisites named by the loaded reference complete, the committed `task` is the next project action.

Direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Target size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase an affected TODO row.

For delegation, copy the TODO Agent exactly to native `agent`. Copy workflow, step, skills, and the checkpoint verbatim so assignment byte 0 is:

`[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`

Copy every direct user constraint verbatim into the job body, then add bounded scope and acceptance evidence. Fill every required native field. The child follows its assignment and does not own the parent TODO. End after dispatch and use native auto-delivery; use complete successful delivery text directly. Read one child artifact only when delivery explicitly marks it preview or truncated and omitted content could change the conclusion.

For substantive code mutation using the loaded code method, parent-owned pre-dispatch prerequisites are local and decision-relevant external discovery, a detailed dependency-wave plan of non-overlapping vertical slices, and one read-only plugin `plan` review when exposed. Each native `task` slice owns test mutation, valid RED, minimum production, the same-command GREEN, refactor, and returned evidence. Main integrates deliveries, verifies the current tree, and writes `MAIN REVIEW` before native `reviewer` receives only the Main-reviewed bounded diff and evidence. Main validates findings; a supported finding returns to `task` as a bounded repair, followed by refreshed evidence, another Main review, and at most one fresh reviewer. This code lifecycle does not apply to another domain unless its loaded resources name it.

Main retains parent TODO, integration, permissions, external-effect decisions, VERIFY, and final delivery. No instruction above creates a required fork, fixed fanout, hard router, runtime gate, retry, continuation, repair loop, permission, or completion controller.
<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:END -->
