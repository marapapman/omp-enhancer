# `writing` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word).
- Skills: `writing-review`, `format-humanizer`, `plain-chinese-writing`, `zh-research-achievement-writing`, `zh-format-humanizer`, `zh-writing-review`, `zh-writing-polish`, `writing-markdown-helper`, `zh-writing-markdown-helper`, `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`, `latex-beamer-slides`, `beamer-to-powerpoint`, `slides-storyline`, `docx`
- Agent candidates: `writer`, `zh-writer`, `checker`, `zh-checker`, `task`.

## Required step order

These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.

1. Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word).
2. Load matching language and format skills.
3. Draft or revise via writer/zh-writer for substantial work, or directly for minor edits.
4. For new Beamer decks, discuss and capture each page in a Markdown content plan whose titles avoid the "XX：XX" label+colon+label pattern and read as coherent prose in deck order, confirm it with the user, reconcile the slide order with a separate task, and only then translate the plan into Beamer and begin layout.
5. Check via checker/zh-checker for substantial work; Main checks minor edits directly.
6. Deliver with preservation and consistency verification.

## Scope notes

- Language selection: use zh skills for Chinese prose, en skills for English; detect from target body, not instruction language.
- LaTeX/Beamer/Word/Markdown are format overlays, not separate workflows; select matching format skills.
- Main chooses whether to delegate writing or handle it directly based on scope.
- For new Beamer decks, start with a text-only Markdown content plan, discuss and confirm each page with the user, then launch a separate task to reconcile the slide order on the plan (no content overlap, semantically coherent modules, logical overall progression; page titles avoid the "XX：XX" label+colon+label pattern and all titles read as coherent prose in deck order; crossings that reordering or regrouping cannot fix return to Markdown reconfirmation) before translating it into Beamer and beginning visual authoring and basic layout. The Markdown content plan is the canonical content source and the Beamer .tex files are derived layout artifacts; content changes go to Markdown first, require user reconfirmation, and then regenerate Beamer before layout resumes.
- Chinese slide copy uses plain-chinese-writing for natural sentences, zh-format-humanizer for AI-like phrasing, and zh-writing-review for page-level clarity; English slide copy uses format-humanizer for AI-tell removal and writing-review for page-level review; use zh-writing-polish only for actual polishing and never replace body prose with keyword or phrase lists.
- De-AI is one-sighting in every language: any listed tell justifies an edit on its first appearance — prefer an over-correction to a miss ("宁可误杀，不可放过"). Only quotations, titles, proper names, passages discussing a phrase rather than using it, text predating November 30, 2022, and details that carry the writer's voice (specific unusual details, mixed feelings, first-person choices) are exempt.
- Hard phrasing bans in every deliverable (prose, slides, figures, documents): no "不是X，而是Y" contrast-repetition construction or its English equivalents ("not X, but Y", "not just X") — state the claim once, directly, with no restatement in inverted or synonym form; no opening or closing one-sentence summary that restates what the text just showed; and, in structured artifacts, no "XX：XX" label+colon+label titles or label-colon bullet lead-ins. These are fixed whenever found, not clustering-gated tells. Verbatim quotations and cited material are exempt.
- No "specifics then sweep" summary clause: do not follow a concrete factual clause with a summarizing clause that elevates it to a sweeping whole ("……。这些共同构成了……/这一切标志着……/正是这些……成就了……"; English "Together, these ...", "All of this marked ...", "It was these ... that ..."). The tell has two faces: the second clause adds no new fact, only inflation; and its skeleton mirrors the first clause (same object, scope adverb, agent, completion verb), forming a loose pseudo-parallel couplet. This is the documentary-narration "画面＋全称升华" two-beat sentence — a stock template of AI-written popular history. Fix by keeping the concrete clause and cutting the sweep, or by replacing the sweep with a real fact.
- No "understanding promise" transitions ("理解了 X，Y 就好懂了", "把这个说清楚，A、B 和 C 就容易理解了", "X is the key to understanding Y"): an empty promise about the reader's future comprehension with no stated dependency — delete it, or state the real dependency concretely ("A、B、C 都以 X 为基础"), or, when the text really covers the listed items in order, write the roadmap instead ("先讲 X，再看 A、B 和 C"). This is fixed whenever found, not clustering-gated.
- No defensive writing in any deliverable: never pad a claim with hedging qualifiers that dilute it — 可能/或许/大概/某种程度上/在一定条件下/通常来说, "可能/possibly/perhaps/somewhat/relatively/fairly/quite", "it is worth noting that", "值得注意的是", "generally speaking", "to some extent" — unless the hedge is itself a sourced fact (measured variance, a cited confidence interval, a genuinely known scope limit). Never add self-protective filler: boilerplate disclaimers, "本文仅代表个人观点", over-attribution ("许多研究表明" without a citation), apologia for limitations nobody asked about, or a paragraph that argues against its own claim before making it. State the result and its actual scope; cut the armor.
- For Beamer, a single read-only visual precheck is performed by Main or task, with Main naturally selecting the one owner (never both), after task's initial render and before task layout; findings are advisory input to the normal task pass, then task integrates and renders the final revision, which Main reviews read-only as the single review owner (a task that did not produce the revision may review instead).
- beamer-to-powerpoint is conditional on an explicit user-supplied conversion command; use it only when PowerPoint output is in scope and never choose or invent a converter.
- Beamer Phase 2 visual assets follow the visual workflow asset contract: official icons and assetseeker stock first, generated images opt-in with provenance recorded in the content plan; operational detail lives in latex-beamer-slides.
