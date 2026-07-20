---
name: writing-mad-writer
description: Use after Main selects writing.en and assigns a writer child to draft multiple English sections quickly with one focused multidimensional self-check. Not for conservative polishing, bounded review-only work, or strict evidence-matrix writing.
---
# Writing Mad-Writer

## Purpose

Write document sections, run one focused inline check, fix clear local issues, and flag evidence or author-decision gaps. Additional write-check-fix passes are optional and run only when the user explicitly asks for iterative revision.

## Workflow boundary

Use this Skill only after Main selects workflow `writing.en`, loads its exact workflow reference and this Skill, and dispatches a `writer` child. This is the assigned writer child's bounded local method. It does not select or dispatch Agents. Do not recursively fork, spawn, or delegate. Main retains the parent TODO, integration, final verification, and user-visible delivery.

The seven dimensions below are a writer-local self-check. This self-check does not satisfy or replace an independent `checker` delivery selected by Main. Run one bounded local pass; it never starts an automatic repair loop or creates a completion gate. Return the revised text, evidence, limitations, and any author decisions to Main.

This writer child is proposal-only. Return complete proposed text, using
SEARCH/REPLACE blocks or a unified diff when a bounded patch is clearer. Main
retains permission decisions and actual file changes. Do not create or persist
target files, research artifacts, or review logs.

## Inputs

- **paper.md** (required) — current document
- **`.pi/research/storyline.md`** (if exists) — research narrative
- **`.pi/research/literature.md`** (if exists) — related work context

Read only assignment inputs and host-authorized safe paths. A conventional path is not permission to probe or mutate it.

## Workflow

### Iteration 0: Setup

Read the supplied inputs. Identify empty sections (blank or `[TODO]`/`[FILL]` markers). If related work is missing, extract 3–8 keywords from the storyline. Use network access only when the user or host authorizes it and a live network capability is exposed. When both conditions hold, search up to three results per keyword and read selected sources before using them. Otherwise, continue from local evidence and return the missing-source gap to Main.

### Default pass: Write → Check → Fix

**1. Write Sprint** — For each empty/sparse section: read context + `<!-- description: ... -->`, write topic sentence (Level-6 heading, ≤50 chars) + body (≤500 chars), cite literature.

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

1. **Level-6 only** — write paragraphs (topic ≤50 chars, body ≤500 chars). Do not modify structural headings.
2. **Cite or flag** — claims need citations; if none, add `[citation needed]`.
3. **Never fabricate** — skip unverifiable papers and report the evidence gap.
4. **Evidence per issue** — quote text, cite section/paragraph. One issue per bullet.
5. **Negative claims require evidence** — search to confirm absence only when network use is both authorized and available; otherwise mark the claim unresolved.

## Scope Guidance

- Default to one pass.
- Run another pass only when the user explicitly requests it.
- Keep each pass to at most five sections so findings stay reviewable.
- Unfixable issues are reported as limitations and never trigger an automatic retry or hard stop for unrelated work.
