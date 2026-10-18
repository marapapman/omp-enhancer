---
name: writing-mad-writer
description: Use after Main selects writing and passes the assignment to a `writer` text-tool call to draft multiple English sections quickly with one focused multidimensional self-check. Not for conservative polishing, bounded review-only work, or strict evidence-matrix writing.
---
# Writing Mad-Writer

## Purpose

Write document sections, run one focused inline check, fix clear local issues, and flag evidence or author-decision gaps. Additional write-check-fix passes are optional and run only when the user explicitly asks for iterative revision.

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

**1. Write Sprint** — For each empty/sparse section: read context + `<!-- description: ... -->`, then write the section's text in complete natural paragraphs and cite literature; use a Level-6 heading node with 50/500-char limits only when the user or the document gives that template, and let length follow the task and the argument.

**2. Writer-local multidimensional self-check** — Run all 7 checks. Cite specific evidence per finding. No fabricated issues.

| Dimension | Check |
|-----------|-------|
| problem | Clearly defined? Importance justified? Stakeholders identified? |
| novelty | Differentiated from prior work? Specific limitations cited? |
| depth | Non-trivial technical challenges addressed? |
| logic | Arguments consistent? Claims supported? No leaps/contradictions? |
| clarity | All terms defined? Language precise? Unambiguous? |
| eval | Experiments map to RQs? Baselines fair? Metrics appropriate? |
| data | Data/code references real? Reproducibility path clear? |

Severity: CRITICAL (undermines whole claim) / IMPORTANT (needs fix for rigor) / MINOR (nice-to-have).

**3. Fix supported local issues** — Within the assigned pass, define unclear terms, replace vague wording with evidence-backed specifics, expand supported sparse material, and clean formatting. Do not fill factual gaps from assumptions. Return issues that require real experiment data, domain expertise, a user decision, or resolution of contradictory requirements.

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

- Default to one pass.
- Run another pass only when the user explicitly requests it.
- Keep each pass to at most five sections so findings stay reviewable.
- Unfixable issues are reported as limitations and never trigger an automatic retry or hard stop for unrelated work.
