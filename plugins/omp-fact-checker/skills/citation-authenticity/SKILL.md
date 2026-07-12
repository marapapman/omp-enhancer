---
name: citation-authenticity
description: Verify citation metadata and claim-citation alignment.
---

# Citation Authenticity

Verify:

- DOI, arXiv id, PMID, ISBN, or URL resolves to the cited item.
- Title, year, authors, venue, and identifier match the bibliography.
- The cited source supports the sentence near the citation.
- The citation is not being used for a broader claim than it establishes.

Use `MISMATCH` for metadata contradictions and `SUPPORTED` only when both
identity and claim alignment are supported by evidence. When network use is
forbidden and local metadata identifies the item but local source text cannot
establish claim alignment, use `LOCAL_UNVERIFIED`. Use `INSUFFICIENT` when even
the local identity or relevant evidence is absent. Stop after this bounded
check; do not automatically retry resolution or open another evidence lane.
