---
name: claim-extraction
description: Extract atomic, checkable factual claims before fact checking.
---

# Claim Extraction

Extract a focused, bounded set of atomic claims. Make each claim small enough
that one piece of evidence could support or contradict it. For a named list of
facts, extract only that list; do not expand into every factual sentence in the
document.

Prioritize:

- numbers, dates, percentages, benchmarks, and rankings;
- public entities, names, titles, affiliations, and locations;
- citations, DOIs, arXiv ids, and bibliography claims;
- causal statements and comparative claims;
- legal, medical, financial, safety, and policy claims.

Do not include pure opinions, style preferences, or vague thesis statements unless the text presents them as factual.

Finish after one extraction pass. Report omitted scope instead of repeatedly
rescanning or creating another lane.
