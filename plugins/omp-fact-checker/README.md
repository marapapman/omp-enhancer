# OMP Fact Checker

Fact-checking workflow plugin for OMP. It extracts factual claims, collects evidence, compares independent evidence lanes, and provides an advisory completeness review.

The workflow is designed for bounded, low-interruption checks:

- focused checks use one local-first pass and stop with explicit verdicts and limitations;
- broad, high-risk, or explicitly requested cross-checks may use independent evidence lanes;
- local metadata without the source text needed for claim alignment yields `LOCAL_UNVERIFIED`;
- `LOCAL_UNVERIFIED` is a finalOutput claim-verdict alias; structured evidence and the canonical report use `UNVERIFIABLE` for the same state.
- absent relevant evidence yields `INSUFFICIENT`, without automatic search or lane retries.

Strict verdicts align the exact subject, predicate/object, scope, time/version,
and quantifier. A limitation that leaves one of those links unresolved forces an
uncertain verdict. High-impact audit candidates use the separate
`PROVEN / LIKELY / HYPOTHESIS / DISPROVED` evidence ladder and one cheapest
authorized countercheck; zero findings is valid. A parent cannot increase a
child's confidence or evidence level without new evidence and a countercheck.

Structured strict assessment uses a `claimTuple` and `evidenceTuple`. Their
canonical fields are `subject`, `basePredicate`, `objectValue`, `scope`,
`timeVersion`, and `quantifier`, with explicit materiality. Evidence additionally
records `ENTAILS`, `NEGATES`, `ADJACENT`, or `UNKNOWN`, plus strength, limitation,
and countercheck objects. Missing or mismatched tuples fail closed; legacy
compatibility verdicts remain available but do not become strict proof.

Provider metadata from Crossref, arXiv, OpenAlex, DataCite, and Google Fact Check is discovery or identity evidence only. It is returned as `INSUFFICIENT` until an agent reads the underlying passage, table, or dataset.

## Tools

- `fact_check_analyze` extracts claim candidates and builds a `FACT_CHECK_PLAN`.
- `fact_check_evidence` collects local or provider evidence for claims and preserves structured tuple, strength, limitation, and countercheck assessments.
- `fact_check_report` summarizes backward-compatible verdicts and a fail-closed `strictVerdict` into `FACT_CHECK_REPORT`. Strict support requires same-tuple `ENTAILS / PROVEN` evidence, direct evidence in every supporting lane, the planned evidence and independence requirements, claim-specific freshness, no material limitation, and current evidence when the claim requires it. High-priority support also requires a completed countercheck with no disconfirming evidence. Strict contradiction requires same-tuple `NEGATES / DISPROVED` evidence with the negated predicate or object/value identified; a high-priority contradiction also requires a completed countercheck. Staleness remains a temporal finding rather than a compatibility verdict.
- `fact_check_review` performs a non-blocking workflow evidence review. `ready` means the expected workflow artifacts are present; `strictSupportReady` separately reports whether every claim has strict factual support. Missing evidence is returned as findings and never controls session completion. The review accepts the `LOCAL_UNVERIFIED` finalOutput claim-verdict alias and matches it to the canonical `UNVERIFIABLE` report verdict.

The plugin does not block tools, retry work automatically, or prevent session completion. Invalid parameters and real file/network execution errors still use normal error results.

## Agents

- `fact-planner`
- `fact-researcher-a`
- `fact-researcher-b`

Model policy:

- All three agents declare `pi/task`; cross-checking and final review are deterministic: `fact_check_report` recomputes cross-checks and strict verdicts from structured records, and `fact_check_review` validates the final report against session telemetry.
