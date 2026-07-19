# `slides.generate` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `slides.generate`

- Primary when: The user wants a new LaTeX Beamer deck, with template and story decisions completed before frame authoring.
- Reference steps:
  1. [step-1] Inspect project instructions, the template, compiler, and any explicitly supplied conversion command.
  2. [step-2] Validate template readiness through the Beamer entry point, theme, logo decision, layout assets, and a compile smoke.
  3. [step-3] If the template is not ready, discuss its style, logo, aspect ratio, typography, and layout with the user and configure it first.
  4. [step-4] Discuss the purpose, audience, duration, output language, and numbered story outline with the user and obtain confirmation.
  5. [step-5] Generate Beamer frames from the confirmed template and outline, applying the PLAN-selected writing.zh or writing.en method for the agreed output language.
  6. [step-6] Compile and render the draft deck, retaining an initial PDF and page images for the layout pass.
  7. [step-7] Perform the final layout pass across the deck, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, spacing, and hierarchy without changing the confirmed story.
  8. [step-8] Reconcile the layout revision against the confirmed outline, output language, source facts, semantic anchors, and LaTeX structure; restore unintended content or scope changes before rendering.
  9. [step-9] Recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh renders of every page, and an overview or contact sheet.
  10. [step-10] Independently inspect the latest rendered pages and overview or contact sheet for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and cross-slide consistency, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision.
  11. [step-11] For each material finding, produce a bounded new layout revision, have the parent reconcile content and scope, then recompile and create fresh renders before another independent visual review; use a maximum of three review rounds and never review an unchanged artifact.
  12. [step-12] Only when the user supplied a conversion command, run it after the final Beamer revision passes independent visual review and verify the PowerPoint artifact.
- Optional Agent candidates: `designer`, `visioner`.
- Optional delegation ideas:
  - step-7: designer owns the final layout pass and every layout revision
  - step-10: visioner independently reviews the latest rendered pages and deck overview
  - step-11: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders
- Quality checks:
  - template readiness, confirmed story outline, post-layout semantic and LaTeX preservation, output-language writing compliance, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, compile evidence, and user-command conversion evidence when requested
- Scope notes:
  - Template discussion precedes story discussion when configuration is incomplete.
  - A familiar template or converter is not a substitute for the user-selected template or command.
  - When Main delegates, the designer owns slide-layout changes and the visioner remains read-only; source inspection, compile success, or author self-review does not replace current-revision visual evidence.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
