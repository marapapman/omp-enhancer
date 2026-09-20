# `research` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.
- Skills: `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity`
- Agent candidates (host runtime adapter labels): `fact-researcher-a`, `fact-researcher-b`, `fact-researcher-c`, `fact-challenger`, `fact-planner`, `scout`, `writer`, `zh-writer`.

Text capability note: `writer` and `zh-writer` are the dedicated language-matched text tools for all English/Chinese prose and copy; they appear under their packaged Agent adapter names only because the current OMP host exposes model workers that way. That backend label is not a second general-purpose writer agent and grants no code or file permissions; Main/task own code and other non-text actions.

## Required step order

These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.

1. Decompose into checkable claims or research questions.
2. Collect evidence from primary sources; corroborate with multiple sources.
3. Cross-check evidence lanes for agreement, conflicts, and staleness.
4. Route all user-facing research text through the language-matched dedicated text tool before synthesis: English goes to writer, Chinese goes to zh-writer, and mixed-language output uses separate writer and zh-writer text-tool calls.
5. The writer/zh-writer text tool drafts the source-linked synthesis with confidence levels; Main integrates the returned text verbatim.
6. Review verdicts for overclaiming; report limitations without drafting or rewriting prose.

## Scope notes

- Prefer primary sources; corroborate key claims with multiple independent sources.
- Research roles handle evidence collection, claim extraction, and source comparison. Any user-facing prose — summaries, recommendations, verdicts, explanations, titles, captions, labels, narrative copy, and UI copy — is authored only by the language-matched dedicated text tool, keeping research prose writer-only: route English to writer and Chinese to zh-writer, using both for mixed-language output. Main only calls the text tools and integrates returned text verbatim; Main never drafts, rewrites, translates, polishes, or otherwise edits wording.
- Verdicts preserve exact claim tuples; compatibility evidence is not proof.
- The deterministic pipeline for a document-level check is fact_check_analyze -> fact_check_evidence (lane A, lane B and C only when warranted) -> fact_check_report -> fact_check_review; these four tools ship in the default tool inventory, so a natural-language check request needs no activation step.
- Omission defence is layered: every researcher lane also enumerates the document and returns FACT_CLAIM_CANDIDATES, fact_check_merge takes the union of those candidates (a claim only one observer lists is kept and flagged single-lane rather than dropped), and fact_check_challenge appends MISSED claims back into the plan for a fresh evidence pass.
- Evidence lanes get different models from the OMP agents hub (/agents), not from /model: /model sets the session model, so unbound lanes would all follow it and cross-checking would compare a model with itself.
