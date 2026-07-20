---
name: writing-review
description: Use for a bounded review, correction, revision, or polish of existing English prose, including a proposed replacement in LaTeX and a semantic-drift check; revise only when authorized. Not for first-draft authoring, direct Markdown drafting, or a broad seven-dimension manuscript audit.
---

# Writing Review

## Executor Boundary

Reading this Skill prepares a writer assignment; by itself it does not turn
Main into the executor. This body is the assigned writer child's bounded local method
after Main selects the workflow and Skill. This Skill does not select or dispatch Agents;
Main retains Agent selection and dispatch.
The one-pass method never satisfies the independent checker checkpoint, and
the writer's local self-check does not replace the independent checker. Main
owns the parent TODO, finding disposition,
integration, final verification, and user-visible delivery.

The user need not request delegation explicitly.
Target length only bounds the executor method and finding count.
It is not a Main direct-fallback reason.
Read-only delivery, an integrated final response, and coordination overhead are
not fallback reasons. The assigned writer returns the complete requested
proposal; the selected workflow keeps its writer delivery,
dependent checker delivery, and parent integration checkpoints.
If a current permitted limitation prevents dispatch, Main records the limitation
and uses safe direct fallback only for that affected checkpoint.

This writer child is always proposal-only. Return the complete proposed text
requested by the assignment, using SEARCH/REPLACE blocks or a unified diff
when that makes a bounded change clearer. Main retains permission decisions
and actual file changes. Do not create or persist review artifacts.

When the user identifies a target file or passage, review that target directly.
Use `.pi/research/checker_report.md` only when the user supplies or references
it, or the active workflow already exposes it. Do not probe `.pi` merely to
discover whether a prior report exists.

For an assigned English LaTeX prose polish, first review the requested passage
against its semantic and LaTeX anchors, then produce the requested revision in
the same bounded proposal-only pass.
Preserve custom
commands and revision markup; revise only the user-authorized active prose
inside them. A host-provided skill body is already loaded and must not be read
again.

`writing-checkers` is a broad review Skill, not the `checker` Agent. Use that
Skill as a companion only for a broad whole-document or project-wide argument
review. A local section, paragraph, or sentence polish does not need the broad
Skill unless the user explicitly asks for that review. Under the workflow's
soft default, Main may independently choose a currently exposed `checker`
Agent for a bounded semantic drift, logic, and clarity check; this Skill does
not select or dispatch that Agent. A Main-side Skill load, writer self-check,
or broad `writing-checkers` Skill load is not independent-checker execution or
evidence.

## Assigned Writer One-Pass Method

1. Read the exact target once and record semantic anchors in the source:
   qualifiers, modality, scope,
   negation, direction, numbers and units, citations and identifiers, and
   LaTeX math, cross-references, commands, and structure.
2. Sort findings as critical, important, or minor while preserving their order
   within each severity.
3. For an explicitly authorized content revision, propose clarity, grammar,
   structure, tone, and formatting fixes that preserve claims. A review-only
   request produces findings rather than a rewritten document.
4. Do not silently change a factual statement, central argument, citation
   meaning, or requested scope. Present those items as author decisions.
5. Compare the result with the source once. Treat any changed semantic anchor
   as an advisory finding, not as a reason to start another repair cycle.
6. Review the resulting text once and summarize proposed changes, unresolved
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
findings. Keep the semantic-anchor inventory internal, omit
empty severity sections and full-source restatements, and return the delivery
to Main as soon as the complete target supports the findings. This finishes
only the writer-child pass; it neither completes the parent workflow nor
replaces an independent checker delivery.

## Optional Interactive Mode

Use accept, modify, or skip prompts one issue at a time only when the user
explicitly requests issue-by-issue review or when one material decision is
needed. Ordinary requests such as "polish this section" already authorize safe
writing fixes and do not require a confirmation after every issue.

## Logging

When `.pi/research/review_log.md` is part of the active workflow, return a short
proposed record for each addressed, deferred, or skipped finding. Main decides
whether an authorized integration persists it. Do not create workflow files
merely to satisfy this Skill.

When an additional broad review was explicitly requested, Main may declare and
load `writing-checkers` during PLAN through the runtime's normal Skill
mechanism. This writer child neither loads it nor treats its body as independent
checker execution. Legacy slash-skill text is documentation, not a command to
attempt.
