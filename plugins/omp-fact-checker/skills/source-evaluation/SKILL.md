---
name: source-evaluation
description: Supporting method for comparing source authority, freshness, independence, and exact evidence fit during fact checking. It is not a complete fact-check workflow and does not issue claim verdicts by itself.
---

# Source Evaluation

Evidence quality order:

1. User-provided primary source or local ground truth.
2. Official source of record, standard body, government page, DOI metadata, PubMed, Crossref, DataCite, OpenAlex, arXiv.
3. Reputable secondary source with clear citations.
4. General web pages only as weak supporting evidence when network use is allowed.

Check:

- Does the source actually mention the claim?
- Is the source current enough?
- Is the source independent when the task actually requires another evidence lane?
- Does the evidence support the exact wording, or only a weaker adjacent claim?
- Are units, dates, versions, authors, and titles aligned?

Compare subject, predicate, object/value, scope, time/version, and quantifier.
Evidence for a weaker or adjacent statement is `INSUFFICIENT`, not support for
the broader claim. Evidence can contradict only the same aligned tuple; a
different scope, date, version, or population is merely incomparable unless it
directly negates the claim.

Record concrete limitations before the verdict. A missing passage, unknown
scope or date, incomplete search space, or metadata-only match constrains the
verdict even when the source itself is authoritative.

Do not silently bridge different subjects or containers: a catalog listing is
not evidence about a release unless completeness and release identity are
established. Treat absence evidence the same way. It can negate an existence
claim only when the observed search space is exhaustive, current, and aligned
to the claim; unknown coverage is `INSUFFICIENT`.

For a focused check, inspect available local source text once before considering
network evidence. Bibliography metadata, a DOI, or an arXiv identifier confirms
identity only; it does not prove that the source supports the nearby claim. If
network use is forbidden and the needed source text is absent, return
`LOCAL_UNVERIFIED`. If no relevant local evidence exists, return
`INSUFFICIENT`. Do not retry or add another lane automatically.
