---
name: writing-review
description: Use for a bounded review, correction, revision, or polish of existing English prose, including a proposed replacement in LaTeX and a semantic-drift check; revise only when authorized. Not for first-draft authoring, direct Markdown drafting, or a broad seven-dimension manuscript audit.
---

# Writing Review

## Executor Boundary

Main performs this review itself: the former `writer`, `zh-writer`, `checker`, and
`zh-checker` agents are removed, and nothing here routes work to them. Main owns
the parent TODO, finding disposition, integration, final verification, and
user-visible delivery. Target length only bounds this method and the finding
count.

Every revised passage is Main's own draft passed through the `polisher` tool, and
Main inserts the returned text verbatim. A review that produces replacement text
sends that text to `polisher` before delivery, and any later wording change goes
back through `polisher` again. A review-only request produces findings rather
than rewritten prose. Do not create or persist review artifacts.

When the user identifies a target file or passage, review that target directly.
Use `.pi/research/checker_report.md` only when the user supplies or references
it, or the active workflow already exposes it. Do not probe `.pi` merely to
discover whether a prior report exists.

For an English LaTeX prose polish, first review the requested passage
against its semantic and LaTeX anchors, then draft the revision and pass it
through `polisher`, using the returned text as the replacement.
Preserve custom
commands and revision markup; revise only the user-authorized active prose
inside them. A host-provided skill body is already loaded and must not be read
again.

`writing-checkers` is a broad whole-document audit method, not a separate review
role. Use it as a companion only for a broad whole-document or project-wide
argument review. A local section, paragraph, or sentence polish does not need the
broad method unless the user explicitly asks for that review. For a bounded
semantic drift, logic, and clarity check, Main runs
`writing_quality_check`/`writing_logic_check` or its own read-only pass; this
Skill neither selects nor dispatches anything. Running the broad
`writing-checkers` method is a review step, not a rewrite: its findings are
advisory and every wording repair goes back through `polisher`.

## One-Pass Method

Use this order: claims and evidence plus semantic anchors first; logic and
structure second; sentence and style polish last.

1. Read the exact target once and first inventory its claims, evidence or source
   support and limits, then record semantic anchors:
   qualifiers, modality, scope,
   negation, direction, numbers and units, citations and identifiers, and
   LaTeX math, cross-references, commands, and structure.
2. Check that each claim stays within its evidence and inspect logic and
   structure: argument order, dependencies, unsupported leaps, causal direction,
   and where evidence-backed claims end. Mark unsupported significance or
   evaluation language for replacement or deletion.
3. Only after the claims, evidence, logic, and structure are stable, propose
   clarity, grammar, sentence, style, and formatting fixes that preserve claims.
   Treat AI writing tells as fixable defects: staged "not X but Y" contrasts,
   one-line closers that only restate, sayings that sound deep, staged run-up
   openers, forced triads, dashes as universal connectors, inflated significance,
   shallow -ing riders, anaphoric passive riders (a complete main clause plus a
   comma and a with + object + past participle + by + anaphoric actor adjunct),
   anaphoric callback clauses (a complete main clause plus a comma and a clause
   headed by this, that, which, or these whose predicate only labels or stamps
   what precedes), borrowed authority, bold as decoration, chatbot residue,
   abstract-restatement echoes (a fact restated as a quoted or nominalized
   concept one level up), announcer transitions ("The real question is ...",
   "A new question is ...", "This raises a deeper question ..."), and
   rhythm-matched paired-phrase closers ("faster, cheaper, better").
   Reject hollow assertions such as "this is important/significant/transformative"
   and "this demonstrates the power/value". Replace them with concrete facts,
   evidence, scope, or a stated limitation, or delete unsupported wording.
   Retain evidence-backed claims and state the support. Any listed tell justifies
   an edit on its first sighting; prefer an over-correction to a miss. In this
   same polish step, apply information gain. Keep only what adds a new fact, a
   necessary qualifier, or a key logical relation, omit wording the reader can
   infer from context, and delete redundant expression instead of restating it.
   For an anaphoric passive rider, fold the rider's action and new object into
   the main clause; write the actor's name once only when it is recoverable from
   the main clause or earlier context, otherwise keep the anaphor or split the
   sentence, and never invent an actor. Pure repetition belongs to the
   restatement family, shallow -ing riders to their own family, and anaphoric
   passive riders carrying an action or a new object to this one. For an
   anaphoric callback clause, fold a tail that carries a fact into the main
   clause and delete a tail that only names or stamps what the main clause
   already said, and never invent a fact or a name to complete the merged
   sentence.
   Never cut a unique fact, number, unit, scope, condition, modality, negation,
   causal direction, citation, safety instruction, or reproducibility step, and
   never force needless explanation or uniformly short sentences onto long
   linked sentences while each clause still informs. A review-only
   request produces findings rather than a rewritten document.
4. Do not silently change a factual statement, central argument, citation
   meaning, or requested scope. Present those items as author decisions.
5. Compare the result with the source once. Treat any changed semantic anchor
   as an advisory finding, not as a reason to start another repair cycle.
6. The read-only checks may report only logic, evidence, semantic-drift,
   and clarity findings, including information-gain findings; they must not
   rewrite prose. Every substantive repair is Main's own redraft passed through
   `polisher`, and the returned text is what lands in the artifact.
7. Review the resulting text once and summarize changes, unresolved
   decisions, and evidence limitations.
8. Report which AI-tell families the revision touched and which tells were left
   in place because they carry the author's voice, so a later review can
   distinguish judgment from omission.

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
starting another review cycle automatically.

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
empty severity sections and full-source restatements, and deliver as soon as
the complete target supports the findings. This finishes
only this review pass and the `polisher` step it feeds; it does not complete the
parent workflow.

## Optional Interactive Mode

Use accept, modify, or skip prompts one issue at a time only when the user
explicitly requests issue-by-issue review or when one material decision is
needed. Ordinary requests such as "polish this section" already authorize safe
writing fixes and do not require a confirmation after every issue.

## Logging

When `.pi/research/review_log.md` is part of the active workflow, record a short
entry for each addressed, deferred, or skipped finding when the user authorizes
that write. Do not create workflow files
merely to satisfy this Skill.

When an additional broad review was explicitly requested, Main may load
`writing-checkers` during PLAN through the runtime's normal Skill
mechanism and run it as its own read-only audit; the body never treats that
audit as a rewrite. Legacy slash-skill text is documentation, not a command to
attempt.
