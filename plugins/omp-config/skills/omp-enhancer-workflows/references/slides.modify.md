# `slides.modify` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `slides.modify`

- Primary when: The user wants bounded wording, language, or existing-style changes to a current LaTeX Beamer deck.
- Reference steps:
  1. [step-1] Read the exact target, body language, current template and style, and local build commands.
  2. [step-2] Apply the PLAN-selected writing.zh or writing.en method from the slide body while preserving LaTeX structure and semantic anchors.
  3. [step-3] Apply only the requested wording, language-norm, and existing-style changes while preserving story order, template, logo, layout, math, citations, code, and unrelated content.
  4. [step-4] Compile and render the affected deck, then inspect the semantic diff and identify the changed frames and any pages whose layout they can influence.
  5. [step-5] Perform a final layout pass on the changed frames and affected pages, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, and spacing while preserving the existing visual style.
  6. [step-6] Reconcile the layout revision against the requested semantic diff, LaTeX anchors, and authorized scope; restore any unintended wording, math, citation, frame-order, or unrelated change before rendering.
  7. [step-7] Recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh high-resolution affected-page renders, and a current full-deck overview or contact sheet.
  8. [step-8] Independently review the latest renders for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and consistency with the existing deck, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision.
  9. [step-9] For each material finding, make only the necessary bounded fix, have the parent reconcile semantics and scope, then recompile and create fresh rerenders before another independent visual review; use a maximum of three review rounds and report any unresolved limitation.
- Optional Agent candidates: `designer`, `visioner`.
- Optional delegation ideas:
  - step-5: designer owns the bounded final layout pass and any resulting source revision
  - step-8: visioner independently reviews the latest affected-page renders
  - step-9: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders
- Quality checks:
  - requested-scope preservation after every layout revision, source-language writing compliance, semantic and LaTeX anchor preservation, existing visual-style consistency, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, and compile evidence when in scope
- Scope notes:
  - Do not reopen template selection or story planning for an ordinary modification.
  - A path-only request remains language-pending until the target body is read.
  - Do not widen scope to unrelated pre-existing layout defects; shared template or macro changes expand visual review to every page they can affect.
  - When Main delegates, the designer owns bounded layout revisions and the visioner remains read-only; review only evidence from the current revision.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
