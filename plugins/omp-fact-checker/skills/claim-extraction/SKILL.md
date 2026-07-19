---
name: claim-extraction
description: Supporting precheck for broad or multi-claim text that must be split into atomic claim tuples before verification. It does not collect evidence or issue fact-check verdicts.
---

# Claim Extraction

Extract a focused, bounded set of atomic claims. Make each claim small enough
that one piece of evidence could support or contradict it. For a named list of
facts, extract only that list; do not expand into every factual sentence in the
document.

Represent each claim as an explicit tuple: `subject`, `predicate`,
`object/value`, `scope`, `time/version`, and `quantifier`. Preserve words such
as all, only, most, at least, and currently. Split a sentence when one evidence
item could align with only part of that tuple.

Prioritize:

- numbers, dates, percentages, benchmarks, and rankings;
- public entities, names, titles, affiliations, and locations;
- citations, DOIs, arXiv ids, and bibliography claims;
- causal statements and comparative claims;
- legal, medical, financial, safety, and policy claims.

Do not include pure opinions, style preferences, or vague thesis statements unless the text presents them as factual.

Finish after one extraction pass. Report omitted scope instead of repeatedly
rescanning or creating another lane.
