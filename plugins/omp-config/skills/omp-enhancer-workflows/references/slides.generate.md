READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `slides.generate` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `slides.generate`

- Primary when: New LaTeX Beamer deck requiring template/story decisions before frame authoring.
- Reference steps:
  1. [step-1] Inspect project instructions, the template, compiler, and any explicitly supplied conversion command.
  2. [step-2] Validate template readiness through the Beamer entry point, theme, logo decision, layout assets, and a compile smoke.
  3. [step-3] If the template is not ready, discuss its style, logo, aspect ratio, typography, and layout with the user and configure it first.
  4. [step-4] Commit a numbered working outline from the supplied purpose, audience, duration, output language, evidence, and safe explicit assumptions; ask only when a missing choice materially changes the deck and cannot be resolved from the request or project context.
  5. [step-5] Generate Beamer frames from the committed template and working outline, applying the PLAN-selected writing.zh or writing.en method for the agreed output language.
  6. [step-6] Compile and render the draft deck, retaining an initial PDF and page images for the layout pass.
  7. [step-7] Perform the final layout pass across the deck, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, spacing, and hierarchy without changing the committed story.
  8. [step-8] Reconcile the layout revision against the committed outline, output language, source facts, semantic anchors, and LaTeX structure; restore unintended content or scope changes before rendering.
  9. [step-9] Recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh renders of every page, and an overview or contact sheet.
  10. [step-10] Independently inspect the latest rendered pages and overview or contact sheet for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and cross-slide consistency, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision.
  11. [step-11] For each material finding accepted by Main, produce a bounded new layout revision, have the parent reconcile content and scope, then recompile and create fresh renders before at most one fresh affected visual review; do not review an unchanged artifact and report remaining findings.
  12. [step-12] Only when the user supplied a conversion command, run it after the final Beamer revision passes independent visual review and verify the PowerPoint artifact.
- Agent candidates: `designer`, `visioner`.
- Delegated checkpoints:
  - step-7: designer owns the final layout pass and every layout revision
  - step-10: visioner independently reviews the latest rendered pages and deck overview
  - step-11: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders
- Quality checks:
  - template readiness, committed story outline, post-layout semantic and LaTeX preservation, output-language writing compliance, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, compile evidence, and user-command conversion evidence when requested
- Scope notes:
  - Visual-stage chain: designer owns the design or source revision; Main reconciles requested scope and binds or renders one current revision; visioner then independently and read-only reviews that current render or layout. Non-visual stages keep their existing owners and are not assigned to designer or visioner merely because the workflow is visual.
  - When designer is unavailable, record the precise unfulfilled design checkpoint with the permitted `fallback=Agent availability`; Main must not silently self-substitute or claim designer evidence. When visioner is unavailable, record the missing independent current-revision visual evidence; source inspection, compile success, designer self-review, or Main self-review is not visioner evidence. These are visible limitations, never a plugin gate, router, fixed dispatch, completion condition, or automatic loop.
  - Template discussion precedes story discussion when configuration is incomplete.
  - A familiar template or converter is not a substitute for the user-selected template or command.
  - When Main delegates, the designer owns slide-layout changes and the visioner remains read-only; source inspection, compile success, or author self-review does not replace current-revision visual evidence.
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