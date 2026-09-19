<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->
# OMP Enhancer Workflow Catalog v43

Advisory reference. Main orchestrates freely through ANALYZE -> EXECUTE -> REVIEW.

## `writing`

- When: Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word).
- Skills: `writing-review`, `format-humanizer`, `plain-chinese-writing`, `zh-research-achievement-writing`, `zh-format-humanizer`, `zh-writing-review`, `zh-writing-polish`, `writing-markdown-helper`, `zh-writing-markdown-helper`, `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`, `latex-beamer-slides`, `beamer-to-powerpoint`, `slides-storyline`, `docx`
- Agents: `writer`, `zh-writer`, `checker`, `zh-checker`, `task`
- Flow:
  1. Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word).
  2. Load matching language and format skills.
  3. Draft or revise via writer/zh-writer for substantial work, or directly for minor edits.
  4. For new Beamer decks, discuss and capture each page in a Markdown content plan whose titles avoid the "XX：XX" label+colon+label pattern and read as coherent prose in deck order, confirm it with the user, reconcile the slide order with a separate task, and only then translate the plan into Beamer and begin layout.
  5. Check via checker/zh-checker for substantial work; Main checks minor edits directly.
  6. Deliver with preservation and consistency verification.

## `research`

- When: Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.
- Skills: `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity`
- Agents: `fact-researcher-a`, `fact-researcher-b`, `fact-researcher-c`, `fact-challenger`, `fact-planner`, `scout`
- Flow:
  1. Decompose into checkable claims or research questions.
  2. Collect evidence from primary sources; corroborate with multiple sources.
  3. Cross-check evidence lanes for agreement, conflicts, and staleness.
  4. Synthesize findings with source links and confidence levels.
  5. Review verdicts for overclaiming; report limitations.

## `visual`

- When: Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.
- Skills: `drawio-skill`, `assetseeker`, `frontend-design`, `canvas-design`, `format-humanizer`, `zh-format-humanizer`
- Agents: `task`
- Flow:
  1. Clarify the diagram type, target language, information claims, real nodes and directed relations (including conditions and grouping meaning), output paths, physical width, and any names, math symbols, or terms that must not change. For diagram-only branches, use drawio-skill (drawio@365-skills) plus the one authoring reference for the chosen method; optional asset prep happens only when the user asks for a more vivid diagram or the confirmed plan names image assets (assetseeker icons or stock; Main pre-generated via the native generate_image tool; bl image via bash for Chinese-text or photoreal nodes) with provenance recorded before drawing.
  2. The author derives a stable node/edge ID list from the source material, then draws the diagram once with drawio-skill and exports: a preview PNG (no -e, longest side <= 2000), a cropped single-page vector PDF, and a final PNG (-e -s 2) repaired with the skill's repair_png.py. Ask the user only when the diagram meaning or physical size changes.
  3. Exactly one independent read-only review of the actual exports: Main when it has image input, otherwise one task that did not author the diagram. The reviewer checks node/edge semantics, edges crossing unrelated boxes, overlapping or collinear edges, arrow attribution, text clipping, font size at physical width, alignment, grouping margins, reading direction, and gray-scale distinguishability; findings name node/edge IDs, location, and one executable local fix.
  4. The author applies at most one local fix round for supported findings (keeping other node/edge IDs and positions), re-exports the same source set, and the same reviewer confirms against the fresh exports that recorded findings are resolved and no new regression was introduced; this confirmation is not a second review pass or a new design round. Remaining findings are reported as limitations.
  5. Deliver the .drawio source plus the exports the task actually needs (default for paper/report: .drawio + cropped vector PDF + clean PNG); Main retains setup authorization and final acceptance only.

<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->
