---
name: writing-checkers
description: 7-dimension content quality review — problem clarity, novelty, technical depth, logic, clarity, evaluation protocol, data reproducibility
---

# Writing Checkers

## Purpose

Review a document (paper, proposal, report) across 7 quality dimensions and produce structured, actionable feedback. Every finding cites specific evidence (section, paragraph, line). No fabricated issues — only what the document actually says.

## Workflow

### Step 1: Read the Entire Document

Use `read` to load the full document before any review. If it's a directory with multiple files, `grep`/`find` to locate the main content file. Understand the complete argument before evaluating any dimension.

### Step 2: Review in Order (One Dimension at a Time)

For each dimension below, produce a block in the output. Never skip dimensions, never reorder them.

| # | Dimension | Guiding Questions |
|---|---|---|
| 1 | **problem** | Is the problem clearly defined? Is its importance justified? Is real-world relevance established? Who benefits and why? |
| 2 | **novelty** | Is the contribution genuinely novel? Is differentiation from prior work explicit? Are specific limitations of existing work cited? |
| 3 | **depth** | Is there non-trivial technical depth? Are actual challenges addressed (not just tuning)? Is the approach more than a straightforward combination? |
| 4 | **logic** | Are arguments internally consistent? Does every claim have supporting evidence? Are there contradictions or leaps in reasoning? |
| 5 | **clarity** | Are all terms defined? Are references accurate? Is language precise and unambiguous? Can a knowledgeable reader follow without guessing? |
| 6 | **eval** | Do experiments map to research questions? Are baselines reasonable and fair? Are metrics appropriate for the claims? |
| 7 | **data** | Do data/code references point to real repositories? Is there a reproduction path (seeds, splits, hyperparameters)? Are reported numbers verifiable? |

### Step 3: Per-Dimension Output Format

```
### [dimension-name]
- **Status:** PASS | ISSUES_FOUND
- **Issues:**
  - [CRITICAL] Description — §Section/Paragraph. _Specific quote or reference._
  - [IMPORTANT] Description — §Section/Paragraph. _Specific quote or reference._
  - [MINOR] Description — §Section/Paragraph. _Specific quote or reference._
```

**Severity definitions:**
- **CRITICAL** — Fundamental flaw that undermines the entire claim (wrong method for the question, unsupported central assertion, contradictory core logic). Must be resolved before acceptance.
- **IMPORTANT** — Needs fix for rigor or completeness (missing baseline, unclear metric definition, unsupported secondary claim). Should be resolved.
- **MINOR** — Suggestion to improve quality (typo, wording, formatting, missing citation). Nice-to-have.

### Step 4: Final Summary

After all 7 dimensions, output:

```
## SUMMARY

| Dimension | Status | Count |
|---|---|---|
| problem | PASS / ISSUES_FOUND | N issues |
| novelty | PASS / ISSUES_FOUND | N issues |
| depth | PASS / ISSUES_FOUND | N issues |
| logic | PASS / ISSUES_FOUND | N issues |
| clarity | PASS / ISSUES_FOUND | N issues |
| eval | PASS / ISSUES_FOUND | N issues |
| data | PASS / ISSUES_FOUND | N issues |

**Overall:** READY | NEEDS_REVISION | BLOCKED
```

**Overall assessment rules:**
- **READY** — All dimensions PASS, or only MINOR issues across the board.
- **NEEDS_REVISION** — Any IMPORTANT issue exists, but no CRITICAL issues.
- **BLOCKED** — Any CRITICAL issue exists. Document must be revised before proceeding.

## Rules

1. **Read the entire document first.** Do not start reviewing before finishing.
2. **Review one dimension at a time, in order.** Do not jump ahead.
3. **Cite specific evidence for every finding.** Use section numbers, paragraph numbers, or line ranges. Quote the relevant text when possible.
4. **Never fabricate issues.** If nothing is wrong with a dimension, report PASS with no issues.
5. **Negative claims require evidence.** Before flagging something as missing or wrong, search the document thoroughly to confirm it's absent.
6. **One issue per bullet.** Do not bundle multiple concerns into one item.
7. **Be precise about severity.** Reserve CRITICAL for fundamental flaws. Over-tagging erodes trust.

## Output Destination

Write to `.pi/research/checker_report.md`. Create the directory if it doesn't exist.

## Pi Integration

- **Trigger:** `/skill:writing-checkers` — a writer or checker agent invokes this command in pi.
- **Tools used:** `read`, `grep`, `find` (to understand document structure and verify references).
- **Output only:** `.pi/research/checker_report.md`. No other files created or modified.
- **No HTML comments.** No `.pi/research/state.md`. No external CLI calls.
