---
name: fact-checking
description: Primary workflow for requests to verify claims, facts, numbers, dates, freshness, citations, or source support in prose and documents. Produces claim-by-claim verdicts with limitations; not for citation formatting, claim extraction alone, or source ranking alone.
---

# Fact Checking Workflow

Return every checked claim in this literal, parse-stable block before any overall limitations:

```text
### Claim <number>
Verdict: <SUPPORTED|CONTRADICTED|LOCAL_UNVERIFIED|INSUFFICIENT>
Evidence: <the closest same-tuple evidence or none>
Limitation: <the decisive proof gap or none>
```

Keep `Verdict:` as a plain line with exactly one allowed uppercase status. Do
not replace it with an arrow, a table cell, a bold standalone status, or prose
such as “the claim is supported.” This stable format does not change which
verdict the evidence warrants.

Run one bounded pass for a focused request:

1. Extract only the requested atomic claims.
2. Inspect the named document, nearby citations, and available local source text.
3. Record each claim's exact alignment and concrete limitation before assigning a verdict.
4. Derive `SUPPORTED`, `CONTRADICTED`, `LOCAL_UNVERIFIED`, or `INSUFFICIENT` once from that record, then return the verdict, evidence, and limitation together.

Compare the exact claim tuple before assigning a verdict:

- `SUPPORTED` requires direct evidence that aligns and entails the claim's
  subject, predicate, object/value, scope, time/version, and quantifier.
- `CONTRADICTED` requires direct evidence that negates the same subject,
  predicate/object, scope, time/version, and quantifier. A different population,
  date, version, or weaker quantifier is not a contradiction.
- Use `LOCAL_UNVERIFIED` when local identity evidence exists but the content
  needed for alignment is unavailable. Use `INSUFFICIENT` for adjacent, weaker,
  incomplete, or incomparable evidence.

The limitation controls the verdict. If a limitation says the evidence does
not establish or guarantee the claim, leaves scope or time unknown, or admits
an incomplete search space, the verdict cannot remain `SUPPORTED` or
`CONTRADICTED`.

Apply these two common boundary cases literally:

- “the catalog lists five plugins” does not entail “the release has five
  plugins” without evidence that the catalog is complete and identifies that
  release. The missing subject/scope bridge makes the verdict `INSUFFICIENT`.
- An absence statement contradicts an existence claim only when the evidence
  establishes an exhaustive, current search over the claim's scope. “No
  rollback document is present” in a summary with unknown coverage is
  `INSUFFICIENT`, not a universal contradiction.

Run a final consistency sweep after drafting limitations. If any definitive
verdict is followed by “if”, “depends”, “ambiguous”, “unknown”, “incomplete”,
“may not”, or equivalent wording about a material tuple field, downgrade it to
`LOCAL_UNVERIFIED` or `INSUFFICIENT`. Never leave a conditional `SUPPORTED` or
`CONTRADICTED` heading above a limitation that withdraws its premise.

Use a separate evidence-strength ladder for candidate conclusions:

- `PROVEN`: direct, claim-aligned evidence establishes the conclusion.
- `LIKELY`: strong evidence exists with one named, non-decisive uncertainty.
- `HYPOTHESIS`: the conclusion is plausible but lacks a necessary link.
- `DISPROVED`: a countercheck defeats the candidate conclusion.

For a high-impact candidate, perform one cheapest authorized disconfirming
countercheck, such as checking the caller, downstream validation, current
source, or a bounded non-mutating probe. If it cannot be performed, preserve
the uncertainty; do not retry automatically. Zero findings is a valid result:
checking several claim classes never creates a quota to support, contradict, or
flag claims.

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
