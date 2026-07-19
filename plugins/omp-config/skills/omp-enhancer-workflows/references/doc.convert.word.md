# `doc.convert.word` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `doc.convert.word`

- Primary when: The requested output is a Word document or a conversion to or from Word.
- Reference steps:
  1. [step-1] Inspect source and target format.
  2. [step-2] Confirm output location and preservation needs.
  3. [step-3] Create or convert.
  4. [step-4] Review headings, tables, figures, and document structure.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - step-3: keep pure conversion language-neutral; when prose changes are requested, use the writer from the composed writing.zh or writing.en workflow
  - step-4: use the composed language checker for revised prose; otherwise the parent owns document-structure and visual review unless another explicitly composed workflow supplies an exact role
- Quality checks:
  - source fidelity, target readability, output existence, and overwrite awareness
- Scope notes:
  - Source preservation and overwrite risk deserve explicit attention.
- Risk notes:
  - Confirm the intended output path before replacing an existing document.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
