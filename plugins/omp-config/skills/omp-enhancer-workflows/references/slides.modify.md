READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `slides.modify` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `slides.modify`

- Primary when: Bounded wording, language, or existing-style changes to a current LaTeX Beamer deck.
- Reference steps:
  1. [step-1] Read the exact target, body language, current template and style, and local build commands.
  2. [step-2] Apply the PLAN-selected writing.zh or writing.en method from the slide body while preserving LaTeX structure and semantic anchors.
  3. [step-3] Apply only the requested wording, language-norm, and existing-style changes while preserving story order, template, logo, layout, math, citations, code, and unrelated content.
  4. [step-4] Compile and render the affected deck, then inspect the semantic diff and identify the changed frames and any pages whose layout they can influence.
  5. [step-5] Perform a final layout pass on the changed frames and affected pages, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, and spacing while preserving the existing visual style.
  6. [step-6] Reconcile the layout revision against the requested semantic diff, LaTeX anchors, and authorized scope; restore any unintended wording, math, citation, frame-order, or unrelated change before rendering.
  7. [step-7] Recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh high-resolution affected-page renders, and a current full-deck overview or contact sheet.
  8. [step-8] Independently review the latest renders for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and consistency with the existing deck, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision.
  9. [step-9] For each material finding accepted by Main, make only the necessary bounded fix, have the parent reconcile semantics and scope, then recompile and create fresh rerenders before at most one fresh affected visual review; do not review an unchanged artifact and report any unresolved limitation.
- Agent candidates: `designer`, `visioner`.
- Delegated checkpoints:
  - step-5: designer owns the bounded final layout pass and any resulting source revision
  - step-8: visioner independently reviews the latest affected-page renders
  - step-9: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders
- Quality checks:
  - requested-scope preservation after every layout revision, source-language writing compliance, semantic and LaTeX anchor preservation, existing visual-style consistency, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, and compile evidence when in scope
- Scope notes:
  - Visual-stage chain: designer owns the design or source revision; Main reconciles requested scope and binds or renders one current revision; visioner then independently and read-only reviews that current render or layout. Non-visual stages keep their existing owners and are not assigned to designer or visioner merely because the workflow is visual.
  - When designer is unavailable, record the precise unfulfilled design checkpoint with the permitted `fallback=Agent availability`; Main must not silently self-substitute or claim designer evidence. When visioner is unavailable, record the missing independent current-revision visual evidence; source inspection, compile success, designer self-review, or Main self-review is not visioner evidence. These are visible limitations, never a plugin gate, router, fixed dispatch, completion condition, or automatic loop.
  - Do not reopen template selection or story planning for an ordinary modification.
  - A path-only request remains language-pending until the target body is read.
  - Do not widen scope to unrelated pre-existing layout defects; shared template or macro changes expand visual review to every page they can affect.
  - When Main delegates, the designer owns bounded layout revisions and the visioner remains read-only; review only evidence from the current revision.
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