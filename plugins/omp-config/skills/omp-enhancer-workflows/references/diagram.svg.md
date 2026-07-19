# `diagram.svg` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `diagram.svg`

- Primary when: The user wants a standalone SVG workflow, process, block, or box diagram with strict monochrome geometry and rendered visual QA.
- Reference steps:
  1. [step-1] Establish the output path, display size, node and edge model, labels, branch semantics, dashed-line meaning, and primary flow direction.
  2. [step-2] Create the standalone SVG in black and white using only simple shapes, straight or dashed lines, and orthogonal polylines, with no curved connectors.
  3. [step-3] Run the static checker, render the current revision at full size and 60% scale, and retain fresh raster evidence.
  4. [step-4] Independently inspect the latest rasters for semantic accuracy, overlaps, text fit, connector collisions, crossings, spacing, and readability.
  5. [step-5] For each material finding, produce a new revision, rerun validation and rendering, then perform another independent visual review of that revision; use a maximum of three review rounds and relayout after repeated geometry failures.
  6. [step-6] Deliver only after final source validation and current-revision rendered evidence; otherwise report the remaining layout or review limitation.
- Optional Agent candidates: `designer`, `visioner`.
- Optional delegation ideas:
  - step-2: designer creates the SVG and owns every source revision
  - step-4: visioner independently reviews the fresh full-size and 60% raster renders
  - step-5: designer applies findings and visioner reviews only the resulting new revision
- Quality checks:
  - node and edge completeness, arrow direction, zero unintended overlap or text clipping, zero connector collision or avoidable crossing, readable font size, balanced spacing, strict monochrome geometry, and current-revision rendered evidence
- Scope notes:
  - When Main delegates, the designer owns SVG changes and the visioner remains read-only; the main agent coordinates revisions.
  - Do not substitute source inspection or author self-review for independent rendered evidence.
  - Review only fresh revisions; do not rerun unchanged reviews.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
