---
name: writing-mad-writer
description: "Fast-mode section writing with one focused self-check and optional user-requested revision passes"
---
# Writing Mad-Writer
## Purpose
Write document sections, run one focused inline check, fix clear local issues, and flag evidence or author-decision gaps. Additional write-check-fix passes are optional and run only when the user explicitly asks for iterative revision.
## Inputs
- **paper.md** (required) — current document
- **`.pi/research/storyline.md`** (if exists) — research narrative
- **`.pi/research/literature.md`** (if exists) — related work context
## Workflow
### Iteration 0: Setup
Read all inputs. Identify empty sections (blank or `[TODO]`/`[FILL]` markers). If related work missing: extract 3–8 keywords from storyline, `web_search_exa("<keyword> site:arxiv.org", max_results=3)` per keyword, `web_fetch_exa` abstracts, write summaries to `.pi/research/literature.md` (max 10 papers per session).
### Default pass: Write → Check → Fix
**1. Write Sprint** — For each empty/sparse section: read context + `<!-- description: ... -->`, write topic sentence (Level-6 heading, ≤50 chars) + body (≤500 chars), cite literature.
**2. Run Checkers (Inline)** — Run all 7 checks. Cite specific evidence per finding. No fabricated issues.
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

**3. Auto-Fix What You Can** — Fixable: unclear term→define, vague→specific, missing→fill, sparse→expand, formatting→clean. Unfixable (flag user): needs real experiment data, domain expertise, user decision, contradictory requirements.
**4. Placeholder Data** — After checkers pass or iteration ≥2 with only unfixable issues: produce placeholder tables/figures with `> **⚠️ BOGUS DATA — replace with real results**`, use domain-appropriate ranges, annotate what real experiment produces it.
**5. Decide Next** — Deliver the improved section and flag unresolved evidence or author decisions. Offer another focused pass instead of starting one automatically.
### Optional Summary
```
Passes: N. Sections: [list]. Issues addressed: [count].
Remaining: [UNFIXABLE] §Section — description.
Next steps: [what user should do].
```
## Rules
1. **Level-6 only** — write paragraphs (topic ≤50 chars, body ≤500 chars). Do not modify structural headings.
2. **Cite or flag** — claims need citations; if none, add `[citation needed]`.
3. **Never fabricate** — skip unfetchable papers. Placeholder data gets `> **⚠️ BOGUS DATA — replace with real results**`.
4. **Evidence per issue** — quote text, cite section/paragraph. One issue per bullet.
5. **Negative claims require search** — confirm absence before flagging.
## Scope Guidance

- Default to one pass.
- Run another pass only when the user explicitly requests it.
- Keep each pass to at most five sections so findings stay reviewable.
- Unfixable issues are reported as limitations and never trigger an automatic retry or hard stop for unrelated work.
