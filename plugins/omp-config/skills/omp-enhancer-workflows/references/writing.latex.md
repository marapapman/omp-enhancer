# `writing.latex` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `writing.latex`

- Primary when: A requested writing, revision, or conversion source/output is LaTeX; compose with another matching format or prose workflow.
- Reference steps:
  1. [step-1] Read the relevant source and local macros.
  2. [step-2] Preserve commands, comments, citations, math, labels, and revision markers.
  3. [step-3] Make the requested change.
  4. [step-4] Inspect the diff and compile when in scope.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - step-3: for prose changes, use the writer from the composed writing.zh or writing.en workflow; keep format-only conversion language-neutral
  - step-4: use the composed language checker for prose review; otherwise the parent owns compile evidence unless another explicitly composed workflow supplies an exact role
- Quality checks:
  - LaTeX structure, active-text boundaries, reference integrity, and compile evidence when requested
- Scope notes:
  - Compilation and publication are separate workflow steps when requested.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
