# `design.visual` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `design.visual`

- Primary when: The requested output is a UI, visual asset, diagram, layout, or interaction design.
- Reference steps:
  1. [step-1] Inspect existing visual context and constraints.
  2. [step-2] Choose a direction.
  3. [step-3] Create or refine the design.
  4. [step-4] Review hierarchy, spacing, typography, responsiveness, accessibility, and states.
  5. [step-5] Verify in the relevant renderer.
- Optional Agent candidates: `designer`.
- Optional delegation ideas:
  - steps-1-4: designer owns the bounded visual direction, implementation, and refinement while preserving the requested scope
  - step-5: the parent reconciles rendered evidence and composes diagram.svg, slides.generate, or slides.modify when independent medium-specific review is required
- Quality checks:
  - visual coherence, responsive behavior, accessibility, and rendered evidence
- Scope notes:
  - Publication and deployment are separate workflow steps.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
