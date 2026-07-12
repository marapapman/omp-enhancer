---
name: source-evaluation
description: Evaluate source reliability and evidence fit for fact checking.
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

For a focused check, inspect available local source text once before considering
network evidence. Bibliography metadata, a DOI, or an arXiv identifier confirms
identity only; it does not prove that the source supports the nearby claim. If
network use is forbidden and the needed source text is absent, return
`LOCAL_UNVERIFIED`. If no relevant local evidence exists, return
`INSUFFICIENT`. Do not retry or add another lane automatically.
