READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `diagram.svg` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `diagram.svg`

- Primary when: Standalone monochrome SVG workflow/process/block/box diagram with rendered visual QA.
- Reference steps:
  1. [step-1] Establish the output path, display size, node and edge model, labels, branch semantics, dashed-line meaning, and primary flow direction.
  2. [step-2] Create the standalone SVG in black and white using only simple shapes, straight or dashed lines, and orthogonal polylines, with no curved connectors.
  3. [step-3] Have task run the static checker, render the current revision at full size and 60% scale, and retain fresh raster evidence.
  4. [step-4] Independently inspect the latest rasters for semantic accuracy, overlaps, text fit, connector collisions, crossings, spacing, and readability.
  5. [step-5] For each visual review finding, produce a new revision, rerun validation and rendering, then the fresh rerenders are reviewed at most once; do not review an unchanged artifact and report remaining geometry failures.
  6. [step-6] Report final source validation and current-revision rendered evidence together with any remaining layout or review limitations; no verdict decides completion.
- Agent candidates: `designer`, `task`, `visioner`.
- Delegated checkpoints:
  - step-2: designer creates the SVG and owns every source revision
  - step-3: task runs the static checker and renders full-size and 60% rasters
  - step-4: visioner independently reviews the fresh full-size and 60% raster renders
  - step-5: designer applies visioner findings, task rerenders, and visioner reviews only the resulting new revision
- Quality checks:
  - node and edge completeness, arrow direction, zero unintended overlap or text clipping, zero connector collision or avoidable crossing, readable font size, balanced spacing, strict monochrome geometry, and current-revision rendered evidence
- Scope notes:
  - Visual-stage chain: designer owns the design or source revision; task owns rendering, compilation, and optional imagegen execution; visioner independently and read-only reviews the current render or layout. Main authorizes external-effect decisions during initial setup and accepts the final delivery. Non-visual stages keep their existing owners and are not assigned to designer or visioner merely because the workflow is visual.
  - When designer is unavailable, record the precise unfulfilled design checkpoint with the permitted `fallback=Agent availability`; Main must not silently self-substitute or claim designer evidence. When visioner is unavailable, record the missing independent current-revision visual evidence; source inspection, compile success, designer self-review, or Main self-review is not visioner evidence. These are visible limitations, never a plugin gate, router, fixed dispatch, completion condition, or automatic loop.
  - Designer creates or revises the SVG, task renders, visioner reviews the renders. No Main coordination required between revisions.
  - Do not substitute source inspection or author self-review for independent rendered evidence.
  - Review only fresh revisions; do not rerun unchanged reviews.
- Risk notes:
  - none

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.