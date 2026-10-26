---
name: writing-mad-writer
description: Use after Main selects writing and passes the assignment to a `writer` text-tool call to draft multiple English sections quickly with one focused multidimensional self-check. Not for conservative polishing, bounded review-only work, or strict evidence-matrix writing.
---
# Writing Mad-Writer

## Purpose

Write the assigned chunk of document sections, run one focused inline check, fix clear local issues, and flag evidence or author-decision gaps. The unit of work is the authorized chunk rather than the whole document. Each chunk arrives as its own `writer` sub-task with the frozen style pack and acceptance checks as inputs, and at most four run in parallel. Additional write-check-fix passes are optional and run only when the user explicitly asks for iterative revision.

This skill inherits the writer text tool's built-in technical prose style and applies it inside the format the user or the target document defines. Its local style list is a supplement; where it conflicts with that baseline, the baseline wins, and an explicit user style still wins.

## Workflow boundary

Use this Skill only after Main selects workflow `writing`, loads its exact workflow reference and this Skill, and passes the assignment to a `writer` text-tool call. This is the `writer` text tool's bounded local method. It does not select or dispatch Agents. Do not recursively fork, spawn, or delegate. Main retains the parent TODO, integration, final verification, and user-visible delivery.

The seven dimensions below are a writer-local self-check. This self-check does not satisfy or replace an independent `checker` delivery selected by Main. Run one bounded local pass; it never starts an automatic repair loop or creates a completion gate. Return the revised text, evidence, limitations, and any author decisions to Main.

The `writer` text tool is proposal-only. Return complete proposed text, using
SEARCH/REPLACE blocks or a unified diff when a bounded patch is clearer. Main
retains permission decisions and actual file changes. Do not create or persist
target files, research artifacts, or review logs.

## Inputs

- **paper.md** (required) — current document
- **`.storyline/exports/r<revision>/storyline.md`** (when the assignment names the path and its revision) — confirmed story snapshot from the workbench; the story source for the deliverable
- **`.pi/research/storyline.md`** (if exists) — research narrative
- **`.pi/research/literature.md`** (if exists) — related work context

Read only assignment inputs and host-authorized safe paths. A conventional path is not permission to probe or mutate it.

The current document may arrive as the bounded chunk Main assigned, together
with its read-only adjacency context and frozen style pack; that chunk, not the
whole document, is the drafting scope for this assignment.

When the assignment supplies an explicitly confirmed story snapshot path plus
its revision, that snapshot is the story source for the deliverable and it wins
over any generic or older outline, `.pi/research/storyline.md` included.
Ordinary local edits keep using the target's current revision.

Drafting from a confirmed snapshot organizes sections and paragraphs from that
snapshot rather than forcing every node into a fixed level-one heading. Return
every node ID in the coverage note, and list each unused node with its reason so
the decision returns to the user.

## Workflow

### Iteration 0: Setup

Read the supplied inputs. Identify empty sections (blank or `[TODO]`/`[FILL]` markers). If related work is missing, extract 3–8 keywords from the storyline. Use network access only when the user or host authorizes it and a live network capability is exposed. When both conditions hold, search up to three results per keyword and read selected sources before using them. Otherwise, continue from local evidence and return the missing-source gap to Main.

### Default pass: Write → Check → Fix

**1. Write Sprint** — Draft the assigned chunk only. For each empty/sparse section in the chunk: read context + `<!-- description: ... -->`, then write the section's text in complete natural paragraphs and cite literature; use a Level-6 heading node with 50/500-char limits only when the user or the document gives that template, and let length follow the task and the argument.

**2. Writer-local multidimensional self-check** — Run all 7 checks. Cite specific evidence per finding. No fabricated issues.

| Dimension | Check |
|-----------|-------|
| problem | Clearly defined? Importance justified? Stakeholders identified? |
| novelty | Differentiated from prior work? Specific limitations cited? |
| depth | Non-trivial technical challenges addressed? |
| logic | Arguments consistent? Claims supported? No leaps/contradictions? |
| clarity | All terms defined? Language precise? Unambiguous? Each sentence adds a new fact, necessary qualifier, or key logical relation — flag redundant or reader-inferable wording for deletion first, never unique facts or anchors? |
| eval | Experiments map to RQs? Baselines fair? Metrics appropriate? |
| data | Data/code references real? Reproducibility path clear? |

Severity: CRITICAL (undermines whole claim) / IMPORTANT (needs fix for rigor) / MINOR (nice-to-have).

**3. Fix supported local issues** — Within the assigned pass, define unclear terms, replace vague wording with evidence-backed specifics, expand supported sparse material, delete redundant or reader-inferable wording before restating it, and clean formatting. Do not fill factual gaps from assumptions. Return issues that require real experiment data, domain expertise, a user decision, or resolution of contradictory requirements.

**4. Decide Next** — Deliver the improved section and flag unresolved evidence or author decisions. Offer another focused pass instead of starting one automatically.

### Optional Summary

```
Passes: N. Sections: [list]. Issues addressed: [count].
Remaining: [UNFIXABLE] §Section — description.
Next steps: [what user should do].
```

## Evidence and effect boundaries

- Never invent placeholder or fake facts, citations, measurements, or numbers. When evidence is insufficient, omit or mark the unsupported claim and return the exact evidence gap to Main.
- Keep every writer effect in-band as proposed text or a bounded patch; Main owns any authorized persistence.

## Rules

1. **Structure follows the document** — write natural paragraphs; use the Level-6 topic-sentence node with a ≤50-char topic and ≤500-char body only when the user or the document gives that template, and let length follow the task and the argument. Do not modify structural headings.
2. **Cite or flag** — claims need citations; if none, add `[citation needed]`.
3. **Never fabricate** — skip unverifiable papers and report the evidence gap.
4. **Evidence per issue** — quote text, cite section/paragraph. One issue per bullet.
5. **Negative claims require evidence** — search to confirm absence only when network use is both authorized and available; otherwise mark the claim unresolved.

## Scope Guidance

- Default to one pass. One pass means one write → check → fix pass over the authorized chunk, never a whole-document round trip.
- Run another pass only when the user explicitly requests it.
- Each call handles exactly one chunk that Main delimited, at most 1,200 words, and the remaining sections belong to other sub-tasks; the five-section figure no longer bounds a call.
- Unfixable issues are reported as limitations and never trigger an automatic retry or hard stop for unrelated work.

The full chunk protocol this Skill works under is the shared chunking contract, quoted verbatim once here:

> Long text orchestration is chunked and context-isolated: Main builds the chunk list in source order with stable ids (chunk-001, chunk-002, …) and records for each chunk its target file, paragraph/page/shape range, and source version; the limits (Chinese at most 2,000 non-whitespace characters per chunk, English at most 1,200 words, slides at most 6 pages, mixed text split by language segment) are a conservative initial orchestration default that splits by default near-2,000-character or near-1,200-word English text to writer and Chinese text to zh-writer, which never continues the previous chunk, never resumes its session, and never receives the whole document or another chunk's round trips; independence never requires a different model. At most four sub-tasks run at once, and lower host capacity batches them while still creating a new context per chunk. Each per-chunk assignment carries a frozen style pack (the original user request, the purpose and readers, output format and template, terminology and subject use, relevant evidence, nearby context and global constraints, and task-specific operation rules) plus style-provenance facts (whether this is a baseline draft, a targeted replacement, or a cross-chunk continuation, and the section names and authoritative text of the supplied methods), the delivery contract (full revised text for an exact replacement, a bounded patch for a small repair, or a diagnosis only for a review, with allowed effects), and acceptance checks covering the factual anchors, numbers, terminology, citations, logical and semantic anchors, structural headings, and formats to preserve. Every semantic or wording change returns a replacement or a bounded patch, never advice alone; a diagnosis-only checker returns exact locations, evidence, and issue types. The original prompt is immutable for the round, and no task, reviewer, summary, template, or later user message may silently narrow or delete its requirements; scope expansion needs new authorization, and any assumption, missing evidence, or unresolved item returns as an explicit limitation. A change to purpose, audience, evidence, scope, format, or template closes the current chunk list and version and opens a new chunking round instead of mutating old tasks. Main integrates the authorized results in source order into a current complete artifact and records file version and coverage, never concatenating scattered terminal messages into the deliverable; task, checker, and reviewer outputs stay proposals until Main integrates them. The independent checker covers terminology and subject use, repeated closers and page templatization, and style coverage across the opening, middle, and closing chunks; the check may be split across chunks so no single checker receives the whole document, each problem is located to a specific chunk, and every wording repair goes to a new writer/zh-writer sub-task, with no final whole-document polish pass. At integration the whole artifact is checked for uncovered content, missing paragraphs or pages, truncated objects, unmerged changes, repeated text, broken cross-references, layout or format faults, and requirement loss; the final report lists covered scope, integrated chunk count and range, checks performed, resolved findings, residual risks, and undelivered items. Every chunk takes one write then check then repair path, with the repair kept narrow; a local format problem is repaired within the chunk's authorization and never blocks other chunks. This is prompt and method orchestration only: no runtime gate, no automatic retry loop, no plugin state, and no permission change.
