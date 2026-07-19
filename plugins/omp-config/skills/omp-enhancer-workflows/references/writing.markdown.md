# `writing.markdown` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `writing.markdown`

- Primary when: A requested writing, revision, or conversion source/output is Markdown; compose with another matching format or prose workflow.
- Reference steps:
  1. [step-1] Read the source and local conventions.
  2. [step-2] Make the requested revision or conversion.
  3. [step-3] Review headings, lists, links, citations, and code fences.
  4. [step-4] Render or verify when in scope.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - step-2: for prose changes, use the writer from the composed writing.zh or writing.en workflow; keep format-only conversion language-neutral
  - step-3: use the composed language checker for prose review while the parent reconciles Markdown structure
- Quality checks:
  - Markdown structure, link and fence integrity, and consistent prose
- Scope notes:
  - Code mentioned inside prose does not by itself make this a code implementation task.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
