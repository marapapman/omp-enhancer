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

Treat a request naming a small set of claims in one document as focused. Use at
most eight local read, grep, or glob calls, including the source document and
nearby evidence. At that checkpoint, return the supported verdicts and mark the
rest `LOCAL_UNVERIFIED` or `INSUFFICIENT`; do not broaden into unrelated
evidence directories merely to avoid an uncertain verdict.

For a focused no-network check, plan for no more than six calls so the user or
host ceiling retains recovery margin:

1. Read the named document once.
2. Discover the local bibliography or cited source location once.
3. Search all requested citation keys, authors, or titles together with one
   combined grep, or read the one exact bibliography file when that is cheaper.
4. Read only a directly cited local source needed to decide claim alignment.

Do not repeat equivalent glob patterns, read an entire bibliography after a
combined search already answered the lookup, or search the whole workspace for
PDF variants merely because cited source text is absent. A failed or empty
last lookup ends the local pass; report the limitation instead of spending a
recovery call.

When network access is forbidden, stay local. Use `LOCAL_UNVERIFIED` when local
bibliography metadata or an identifier exists but the source text needed to
check claim support is unavailable. Use `INSUFFICIENT` when no relevant local
evidence exists. Neither verdict means the claim is false, and neither starts a
retry.
