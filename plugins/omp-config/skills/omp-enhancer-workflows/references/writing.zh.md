# `writing.zh` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `writing.zh`

- Primary when: The prose being drafted or revised is Chinese, regardless of the instruction language.
- Reference steps:
  1. [step-1] Establish meaning, preservation constraints, and the bounded assignment.
  2. [step-2] Draft or revise the requested natural Chinese prose within the established meaning and preservation constraints.
  3. [step-3] Independently review the resulting revision for logic, tone, terminology, readability, and semantic drift without editing the source.
  4. [step-4] Apply only parent-accepted findings once, then have the parent verify scope, voice consistency, semantic anchors, and requested format.
- Optional Agent candidates: `zh-writer`, `zh-checker`.
- Optional delegation ideas:
  - step-2: zh-writer owns the requested Chinese drafting or prose revision
  - step-3: zh-checker independently reviews the resulting revision without editing the source
  - step-4: zh-writer applies only parent-accepted findings once, then the parent verifies scope and semantic anchors
- Quality checks:
  - meaning and semantic-anchor preservation, Chinese logic and style, terminology consistency, independent checker evidence, parent scope reconciliation, and requested format
- Scope notes:
  - This workflow concerns prose rather than code implementation.
  - When Main delegates, the language-matched writer owns prose edits and the checker remains independent and source-read-only; the parent always owns assignment boundaries and final reconciliation.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
