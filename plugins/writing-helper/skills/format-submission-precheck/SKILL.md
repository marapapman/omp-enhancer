---
name: format-submission-precheck
description: "Pre-submission checklist — verify all formatting, citations, figures, and metadata before submitting"
---

# Format Submission Precheck

Checklist-based pre-submission review. Run all 8 checks, report PASS/FAIL per item with specific issues.

## Checks

| # | Check | PASS | FAIL |
|---|-------|------|------|
| 1 | **All Sections Filled** | Every required section (Introduction, Method, Experiments, Related Work, Conclusion) has ≥1 paragraph | Any section missing or empty |
| 2 | **Figures Referenced & Exist** | Every `![...](...)` file exists under `fig/`; no orphan files | Referenced file missing from disk or orphan figure not cited |
| 3 | **Citations in Reference List** | Every `\cite{key}` matches a `.bib` entry; no unused bib entries | Orphan citation or unused entry |
| 4 | **No BOGUS DATA Markers** | Zero `<!-- BOGUS DATA -->` or `BOGUS` comments found | Any bogus marker remains |
| 5 | **Word Count Within Limits** | Total word count ≤ venue limit (use `writingrules.md` or ask user) | Word count exceeds limit |
| 6 | **Abstract Word Count** | Abstract ≤ 250 words | Abstract exceeds 250 words |
| 7 | **Author List Complete** | All authors named with affiliations | Missing author, affiliation, or placeholder |
| 8 | **LaTeX Compiles** | `.tex` file compiles with `pdflatex`/`xelatex` (skip if no `.tex`) | Compilation errors (or ⚠️ N/A) |

## Output Format

```
# Pre-Submission Checklist Report

## Summary
| # | Check | Status |
|---|-------|--------|
| 1 | All Sections Filled | ✅ PASS / ❌ FAIL |
| 2 | Figures Referenced & Exist | ✅ PASS / ❌ FAIL |
| 3 | Citations in Reference List | ✅ PASS / ❌ FAIL |
| 4 | No BOGUS DATA Markers | ✅ PASS / ❌ FAIL |
| 5 | Word Count Within Limits | ✅ PASS / ❌ FAIL |
| 6 | Abstract Word Count | ✅ PASS / ❌ FAIL |
| 7 | Author List Complete | ✅ PASS / ❌ FAIL |
| 8 | LaTeX Compiles | ✅ PASS / ❌ FAIL / ⚠️ N/A |

**Result**: ✅ READY / ⚠️ NEEDS ATTENTION (critical findings: N)

## Issues
### [N]. [Check Name] — ❌ FAIL
- [file:line] — specific issue
### [N]. [Check Name] — ✅ PASS
- No issues.
```

## Rules

1. **Report only** — never modify source files.
2. **Show specific locations** — every issue includes file:line.
3. **Any FAIL affects readiness** — report it as a critical finding; this skill does not block submission or session completion.
4. **Missing directories** — `fig/` doesn't exist → FAIL on Check 2.
