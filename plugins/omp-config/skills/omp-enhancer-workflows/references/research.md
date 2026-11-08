# `research` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.
- Skills: `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity`
- Agent candidates: `fact-researcher-a`, `fact-researcher-b`, `fact-researcher-c`, `fact-challenger`, `fact-planner`, `scout`.

Text capability note: `polisher` is a writing-helper tool, not an Agent. Main drafts the text, calls `polisher` on each bounded passage, and inserts the returned text verbatim; code, evidence, structure, layout, and validation stay with Main/task, and the polisher model may be older or smaller because it performs only language polishing.

## Required step order

These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.

1. Decompose into checkable claims or research questions.
2. Collect evidence from primary sources; corroborate with multiple sources.
3. Cross-check evidence lanes for agreement, conflicts, and staleness.
4. Route every user-facing research text through Main drafting and the polisher tool before synthesis: Main drafts the passage in its body language, calls polisher with the matching zh or en prompt, and inserts the returned text verbatim; mixed-language output is polished segment by segment.
5. Main drafts the source-linked synthesis with confidence levels itself and passes it through polisher; code, evidence collection, source comparison, and structural work stay with the research roles and Main.
6. Review verdicts for overclaiming; report limitations without drafting or rewriting prose.

## Scope notes

- Prefer primary sources; corroborate key claims with multiple independent sources.
- Research roles handle evidence collection, claim extraction, and source comparison. Every user-facing prose surface — summaries, recommendations, verdicts, explanations, titles, captions, labels, narrative copy, and UI copy — is drafted by Main and then rewritten by the polisher tool in its body language; Main inserts each returned text verbatim. Code, evidence, and structure stay with the research roles and Main. The polisher never reviews facts, plans, or tools, and Main never delegates evidence or agentic work to it.
- Information-gain principle, inherited from the writing card: every user-facing sentence in this domain — prose, summary, explanation, caption, label, or UI copy — serves one clear expressive focus and keeps only new facts, necessary qualifications, or key logical relations; delete redundant wording before explaining the same point again, leave reader-inferable links out, let the reader complete the simple inference, and keep every unique fact, number, qualifier, scope, modality, negation, citation, safety instruction, and reproducibility step. Captions and labels keep their own genre conventions, and no scanner score or local metric replaces this sentence-level review.
- Verdicts preserve exact claim tuples; compatibility evidence is not proof.
- The deterministic pipeline for a document-level check is fact_check_analyze -> fact_check_evidence (lane A, lane B and C only when warranted) -> fact_check_report -> fact_check_review; these four tools ship in the default tool inventory, so a natural-language check request needs no activation step.
- Omission defence is layered: every researcher lane also enumerates the document and returns FACT_CLAIM_CANDIDATES, fact_check_merge takes the union of those candidates (a claim only one observer lists is kept and flagged single-lane rather than dropped), and fact_check_challenge appends MISSED claims back into the plan for a fresh evidence pass.
- Evidence lanes get different models from the OMP agents hub (/agents), not from /model: /model sets the session model, so unbound lanes would all follow it and cross-checking would compare a model with itself.
