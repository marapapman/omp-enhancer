---
name: fact-checking
description: Verify factual claims in prose, papers, reports, citations, statistics, and time-sensitive statements with a focused local-first workflow and explicit evidence limitations.
---

# Fact Checking Workflow

Run one bounded pass for a focused request:

1. Extract only the requested atomic claims.
2. Inspect the named document, nearby citations, and available local source text.
3. Assign `SUPPORTED`, `CONTRADICTED`, `LOCAL_UNVERIFIED`, or `INSUFFICIENT` to each claim and cite the evidence used.
4. Return the verdicts and concrete limitations.

Do not rely on model memory for a verdict. Do not automatically retry a failed
search, start another evidence lane, or repeat the workflow. Add an independent
lane only for a broad task, a high-risk claim, or when the user explicitly
requests cross-checking.

When network access is forbidden, stay local. Use `LOCAL_UNVERIFIED` when local
bibliography metadata or an identifier exists but the source text needed to
check claim support is unavailable. Use `INSUFFICIENT` when no relevant local
evidence exists. Neither verdict means the claim is false, and neither starts a
retry.
