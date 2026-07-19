# `writing.pending` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `writing.pending`

- Primary when: Temporary Primary only when a named writing target has not been observed and its prose language is unknown; after one narrow source read, replace it with writing.zh or writing.en before substantive review or revision.
- Reference steps:
  1. [step-1] Read the exact text or document section.
  2. [step-2] Detect its body language.
  3. [step-3] Compose writing.zh or writing.en with any format companion.
  4. [step-4] Revise and review.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - step-1: before the body language is observed, do not delegate to writer, checker, zh-writer, or zh-checker
  - step-3: after detecting the body language, compose writing.zh or writing.en and use only that workflow's language-matched subagents
- Quality checks:
  - preserve meaning, anchors, markup, and document structure
- Scope notes:
  - The instruction language is not evidence of the document language.
  - Language-specific skills remain undecided until source text is available.
- Risk notes:
  - none

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
