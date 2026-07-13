# OMP Fact Checker

Fact-checking workflow plugin for OMP. It extracts factual claims, collects evidence, compares independent evidence lanes, and provides an advisory completeness review.

The workflow is designed for bounded, low-interruption checks:

- focused checks use one local-first pass and stop with explicit verdicts and limitations;
- broad, high-risk, or explicitly requested cross-checks may use independent evidence lanes;
- local metadata without the source text needed for claim alignment yields `LOCAL_UNVERIFIED`;
- absent relevant evidence yields `INSUFFICIENT`, without automatic search or lane retries.

Provider metadata from Crossref, arXiv, OpenAlex, DataCite, and Google Fact Check is discovery or identity evidence only. It is returned as `INSUFFICIENT` until an agent reads the underlying passage, table, or dataset.

## Tools

- `fact_check_analyze` extracts claim candidates and builds a `FACT_CHECK_PLAN`.
- `fact_check_evidence` collects local or provider evidence for claims.
- `fact_check_report` summarizes backward-compatible verdicts and a fail-closed `strictVerdict` into `FACT_CHECK_REPORT`. Strict support requires direct evidence in every supporting lane, the planned evidence and independence requirements, claim-specific freshness, no unresolved conflict, and current evidence when the claim requires it. Staleness remains a temporal finding rather than a compatibility verdict.
- `fact_check_gate` is a compatibility name for a non-blocking workflow completeness review. `complete` means the workflow artifacts are present; `factualSupportComplete` separately reports whether every claim has strict factual support. Missing evidence is returned as findings, never as a session gate.

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
- `fact-researcher-a` and `fact-researcher-b` stay on the active task/default subagent model for evidence collection.
