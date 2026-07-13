---
name: writing-review
description: Bounded English writing review that returns evidence-backed findings and only revises text when the user explicitly requests revision
---

# Writing Review

When the user identifies a target file or passage, review that target directly.
Use `.pi/research/checker_report.md` only when the user supplies or references
it, or the active workflow already exposes it. Do not probe `.pi` merely to
discover whether a prior report exists.

For a direct English LaTeX prose polish, use this skill before editing: first
review the requested passage against its semantic and LaTeX anchors, then apply
the explicitly authorized revision in the same bounded pass. Preserve custom
commands and revision markup; modify only the user-authorized active prose
inside them. A host-provided skill body is already loaded and must not be read
again.

Use `writing-checkers` as a companion only for a broad whole-document or
project-wide argument review. A local section, paragraph, or sentence polish
does not need the seven-dimension checker unless the user explicitly asks for
that broader review.

## Default One-Pass Workflow

1. Read the exact target once and record semantic anchors in the source:
   qualifiers, modality, scope,
   negation, direction, numbers and units, citations and identifiers, and
   LaTeX math, cross-references, commands, and structure.
2. Sort findings as critical, important, or minor while preserving their order
   within each severity.
3. For an explicitly authorized edit or revision, apply clarity, grammar,
   structure, tone, and formatting fixes that preserve claims. A review-only
   request produces findings rather than a rewritten document.
4. Do not silently change a factual statement, central argument, citation
   meaning, or requested scope. Present those items as author decisions.
5. Compare the result with the source once. Treat any changed semantic anchor
   as an advisory finding, not as a reason to start another repair cycle.
6. Review the resulting text once and summarize applied changes, unresolved
   decisions, and evidence limitations.

## Evidence Fidelity

- Copy every quoted passage verbatim from text returned by a successful read.
  Before the final response, check each quote and stated location once against
  that text. Remove or correct anything that is not present.
- Do not invent line numbers when the read result did not expose them. Label a
  paraphrase as a paraphrase instead of placing it in quotation marks.
- Distinguish ambiguity from contradiction. Two statements are contradictory
  only when their subject and scope are actually the same.
- A proposed replacement is an editorial suggestion, not evidence about what
  the source already says.

Process at most 20 findings in one pass. Summarize any remainder without
starting another checker/review cycle automatically.

For a read-only review, return evidence-backed findings and concise local
replacement suggestions only where they help explain a finding. Do not append
a complete rewritten passage or document unless the user explicitly asks for
one. Do not create `.pi` files or request write access solely to satisfy the
workflow template.

A successful read that reaches the end of the requested file is enough for a
bounded writing review. Do not repeat it with a different selector unless the
result contains an explicit truncation marker or an incomplete requested
range. Do not search for macro definitions or unrelated repository context
unless that context is necessary to avoid a concrete false finding about the
visible prose.

For one abstract or another short passage, report at most five material
findings. Keep the semantic-anchor inventory internal, omit empty severity
sections and full-source restatements, and finalize as soon as the complete
target supports the findings.

## Optional Interactive Mode

Use accept, modify, or skip prompts one issue at a time only when the user
explicitly requests issue-by-issue review or when one material decision is
needed. Ordinary requests such as "polish this section" already authorize safe
writing fixes and do not require a confirmation after every issue.

## Logging

When `.pi/research/review_log.md` is part of the active workflow, append a short
record for each applied, deferred, or skipped finding. Do not create workflow
files that the user did not request merely to satisfy this skill.

Load `writing-checkers` through the runtime's normal skill mechanism when an
additional review was explicitly requested. Legacy slash-skill text is
documentation, not a command to attempt.
