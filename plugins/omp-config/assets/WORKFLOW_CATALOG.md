<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->
# OMP Enhancer Workflow Catalog v39

Advisory reference. Main orchestrates freely through ANALYZE -> EXECUTE -> REVIEW.

## `writing`

- When: Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word).
- Skills: `writing-review`, `plain-chinese-writing`, `zh-research-achievement-writing`, `zh-format-humanizer`, `zh-writing-review`, `zh-writing-polish`, `writing-markdown-helper`, `zh-writing-markdown-helper`, `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`, `latex-beamer-slides`, `beamer-to-powerpoint`, `slides-storyline`, `docx`
- Agents: `writer`, `zh-writer`, `checker`, `zh-checker`, `task`
- Flow:
  1. Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word).
  2. Load matching language and format skills.
  3. Draft or revise via writer/zh-writer for substantial work, or directly for minor edits.
  4. For new Beamer decks, discuss and capture each page in a Markdown content plan, confirm it with the user, and only then translate the plan into Beamer and begin layout.
  5. Check via checker/zh-checker for substantial work; Main checks minor edits directly.
  6. Deliver with preservation and consistency verification.

## `research`

- When: Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.
- Skills: `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity`
- Agents: `fact-researcher-a`, `fact-researcher-b`, `fact-planner`, `scout`
- Flow:
  1. Decompose into checkable claims or research questions.
  2. Collect evidence from primary sources; corroborate with multiple sources.
  3. Cross-check evidence lanes for agreement, conflicts, and staleness.
  4. Synthesize findings with source links and confidence levels.
  5. Review verdicts for overclaiming; report limitations.

## `visual`

- When: Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.
- Skills: `drawio-skill`, `frontend-design`, `canvas-design`
- Agents: `task`, `visioner`
- Flow:
  1. Clarify diagram type, format, and rendering requirements.
  2. task draws the diagram once with drawio-skill from drawio@365-skills and exports a draft PNG.
  3. visioner reviews that exported PNG read-only in one pass, flagging edges pressed onto each other or crossing through boxes.
  4. task applies at most one fix round for supported findings and re-exports; deliver the .drawio source with the exported image.
  5. Main retains setup authorization and final acceptance only; remaining findings are reported as limitations.

<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->
