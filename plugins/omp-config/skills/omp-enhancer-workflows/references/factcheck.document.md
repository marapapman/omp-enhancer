# `factcheck.document` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `factcheck.document`

- Primary when: The final deliverable is a claim-by-claim verdict on existing statements, citations, freshness, or source support; add research.web only when live evidence collection is also required.
- Reference steps:
  1. [step-1] Extract checkable claims.
  2. [step-2] Collect relevant independent evidence.
  3. [step-3] Cross-check conflicts and dates.
  4. [step-4] Report support, contradiction, staleness, or insufficiency.
  5. [step-5] Revise only when authorized.
- Optional Agent candidates: `fact-planner`, `fact-researcher-a`, `fact-researcher-b`, `fact-cross-checker`, `fact-reviewer`.
- Optional delegation ideas:
  - step-1: fact-planner decomposes the document into checkable claims and defines the evidence plan
  - step-2: fact-researcher-a and fact-researcher-b collect independent evidence lanes without copying conclusions
  - step-3: fact-cross-checker classifies agreement, conflicts, dates, and evidence gaps without inventing resolution
  - step-4: fact-reviewer independently audits the final claim-to-evidence mapping and wording before the parent reports
- Quality checks:
  - claim-to-evidence correspondence, source quality, temporal validity, and clear uncertainty
- Scope notes:
  - Unverified memory is not equivalent to sourced evidence.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
