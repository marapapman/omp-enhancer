# OMP Fact Checker

Fact-checking workflow plugin for OMP. It extracts factual claims, collects evidence, compares independent evidence lanes, and provides an advisory completeness review.

The workflow is designed for bounded, low-interruption checks:

- focused checks use one local-first pass and stop with explicit verdicts and limitations;
- broad, high-risk, or explicitly requested cross-checks may use independent evidence lanes;
- local metadata without the source text needed for claim alignment yields `LOCAL_UNVERIFIED`;
- absent relevant evidence yields `INSUFFICIENT`, without automatic search or lane retries.

Strict verdicts align the exact subject, predicate/object, scope, time/version,
and quantifier. A limitation that leaves one of those links unresolved forces an
uncertain verdict. High-impact audit candidates use the separate
`PROVEN / LIKELY / HYPOTHESIS / DISPROVED` evidence ladder and one cheapest
authorized countercheck; zero findings is valid. A parent cannot increase a
child's confidence or evidence level without new evidence and a countercheck.

Provider metadata from Crossref, arXiv, OpenAlex, DataCite, and Google Fact Check is discovery or identity evidence only. It is returned as `INSUFFICIENT` until an agent reads the underlying passage, table, or dataset.

## Tools

- `fact_check_analyze` extracts claim candidates and builds a `FACT_CHECK_PLAN`.
- `fact_check_evidence` collects local or provider evidence for claims.
- `fact_check_report` summarizes backward-compatible verdicts and a fail-closed `strictVerdict` into `FACT_CHECK_REPORT`. Strict support requires direct evidence in every supporting lane, the planned evidence and independence requirements, claim-specific freshness, no unresolved conflict, and current evidence when the claim requires it. Staleness remains a temporal finding rather than a compatibility verdict.
- `fact_check_review` performs a non-blocking workflow evidence review. `ready` means the expected workflow artifacts are present; `strictSupportReady` separately reports whether every claim has strict factual support. Missing evidence is returned as findings and never controls session completion.

The plugin does not block tools, retry work automatically, or prevent session completion. Invalid parameters and real file/network execution errors still use normal error results.

## Agents

- `fact-planner`
- `fact-researcher-a`
- `fact-researcher-b`
- `fact-cross-checker`
- `fact-reviewer`

Model policy:

- `fact-planner` declares `pi/plan` then `pi/slow` so claim decomposition is not forced onto the generic task model.
- `fact-cross-checker` and `fact-reviewer` declare `pi/slow` for high-signal review of evidence conflicts and final verdicts.
- `fact-researcher-a` declares `pi/slow` for the primary-source evidence lane.
- `fact-researcher-b` declares `pi/plan` for the independent counter-evidence lane.
- The two researcher agents do not set `thinkingLevel`; each inherits both the model and reasoning level from its configured role.
