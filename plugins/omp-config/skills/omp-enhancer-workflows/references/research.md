# `research` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.
- Skills: `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity`
- Agent candidates: `fact-researcher-a`, `fact-researcher-b`, `fact-planner`, `scout`.

## Required step order

These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.

1. Decompose into checkable claims or research questions.
2. Collect evidence from primary sources; corroborate with multiple sources.
3. Cross-check evidence lanes for agreement, conflicts, and staleness.
4. Synthesize findings with source links and confidence levels.
5. Review verdicts for overclaiming; report limitations.

## Scope notes

- Prefer primary sources; corroborate key claims with multiple independent sources.
- Verdicts preserve exact claim tuples; compatibility evidence is not proof.
