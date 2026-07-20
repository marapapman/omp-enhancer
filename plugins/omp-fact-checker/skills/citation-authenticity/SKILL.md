---
name: citation-authenticity
description: Use when verifying bibliography identity, DOI or URL metadata, and whether a cited source supports the nearby claim. Not for general factual verification without a citation question.
---

# Citation Authenticity

When this Skill is listed in a `writer` or `zh-writer` assignment, it is
evidence context only for that prose checkpoint. The writer consumes fact
findings already supplied by Main and returns a proposal; it does not run this
fact-checking method, invoke Fact Checker tools, collect evidence, or issue a
verdict. Main or a separate selected fact Agent owns the fact-check checkpoint.

Verify:

- DOI, arXiv id, PMID, ISBN, or URL resolves to the cited item.
- Title, year, authors, venue, and identifier match the bibliography.
- The cited source supports the sentence near the citation.
- The citation is not being used for a broader claim than it establishes.

For claim alignment, compare the sentence's subject, predicate, object/value,
scope, time/version, and quantifier with the cited passage. A correct identifier
does not cure a scope, time, population, or quantifier mismatch.

Use `MISMATCH` for metadata contradictions and `SUPPORTED` only when both
identity and claim alignment are supported by evidence. When network use is
forbidden and local metadata identifies the item but local source text cannot
establish claim alignment, use `LOCAL_UNVERIFIED`. Use `INSUFFICIENT` when even
the local identity or relevant evidence is absent. Stop after this bounded
check; do not automatically retry resolution or open another evidence lane.
