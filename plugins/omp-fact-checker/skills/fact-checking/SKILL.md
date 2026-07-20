---
name: fact-checking
description: Domain method for verifying claims, facts, numbers, dates, freshness, citations, or source support in prose and documents. Use it to produce claim-by-claim verdicts with limitations after Main selects a workflow such as factcheck.document; this Skill is not a workflow ID and is not for citation formatting, claim extraction alone, or source ranking alone.
---

# Fact Checking Workflow

When this Skill is listed in a `writer` or `zh-writer` assignment, it is
evidence context only for that prose checkpoint. The writer consumes fact
findings already supplied by Main and returns a proposal; it does not run this
fact-checking method, invoke Fact Checker tools, collect evidence, or issue a
verdict. Main or a separate selected fact Agent owns the fact-check checkpoint.

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

When passing structured claims to the Fact Checker tools, use `claimTuple` with
exactly these canonical fields: `subject`, `basePredicate`, `objectValue`,
`scope`, `timeVersion`, and `quantifier`. Every field is an object containing a
normalized string `value` and `materiality: MATERIAL|NOT_APPLICABLE`; a
`MATERIAL` field must have a value. Do not replace this tuple with an
`aligned: true` assertion.

Each structured evidence record uses `evidenceTuple` with the same canonical
fields plus `relation: ENTAILS|NEGATES|ADJACENT|UNKNOWN`. `NEGATES` also names
`negatedField: BASE_PREDICATE|OBJECT_VALUE`; its canonical field values still
name the same proposition being negated. Different predicate or object values
are `ADJACENT` or `UNKNOWN`, not a same-tuple contradiction. Runtime comparison,
not the caller's status or a bare alignment flag, determines exact matching.

Preserve these separate assessment objects on every strict candidate:

- `strength: PROVEN|DISPROVED|LIKELY|HYPOTHESIS`;
- `limitation: { level: NONE|NON_MATERIAL|MATERIAL, reason: ... }`;
- `countercheck: { status: NOT_REQUIRED|COMPLETED|INCONCLUSIVE|UNAVAILABLE,
  outcome: NOT_APPLICABLE|NO_DISCONFIRMING_EVIDENCE|DISCONFIRMING_EVIDENCE|NO_RESULT,
  note: ... }`.

A countercheck outcome is relative to the original claim. `COMPLETED` pairs
only with `NO_DISCONFIRMING_EVIDENCE` or `DISCONFIRMING_EVIDENCE`;
`NOT_REQUIRED` pairs with `NOT_APPLICABLE`; `INCONCLUSIVE` and `UNAVAILABLE`
pair with `NO_RESULT`. High-priority strict support requires
`COMPLETED / NO_DISCONFIRMING_EVIDENCE`; high-priority strict contradiction
also requires `COMPLETED`, with either valid completed outcome interpreted
relative to the original claim. Same-tuple `ENTAILS + PROVEN` may support;
same-tuple `NEGATES + DISPROVED` may contradict. `LIKELY`,
`HYPOTHESIS`, missing tuples, `ADJACENT`, `UNKNOWN`, tuple mismatches, and
material limitations remain non-definitive. Compatibility verdicts remain
available, but they never upgrade the strict verdict.

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
