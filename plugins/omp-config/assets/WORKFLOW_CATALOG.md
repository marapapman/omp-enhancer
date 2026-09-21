<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->
# OMP Enhancer Workflow Catalog v44

Advisory reference. Main orchestrates freely through ANALYZE -> EXECUTE -> REVIEW.

## `writing`

- When: Prose and copy in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word, PowerPoint/PPTX): the dedicated text tools writer/zh-writer author every wording surface, while Main/task handle code, evidence, structure, layout, conversion, and validation.
- Skills: `writing-review`, `format-humanizer`, `plain-chinese-writing`, `zh-research-achievement-writing`, `zh-format-humanizer`, `zh-writing-review`, `zh-writing-polish`, `writing-markdown-helper`, `zh-writing-markdown-helper`, `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`, `latex-beamer-slides`, `beamer-to-powerpoint`, `slides-storyline`, `docx`
- Agents (host runtime adapter labels): `writer`, `zh-writer`, `checker`, `zh-checker`, `task`
- Flow:
  1. Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word/PowerPoint/PPTX).
  2. Load matching language and format skills.
  3. The substantive-text sequence starts with a proposal from the language-matched dedicated text tool, writer (English) or zh-writer (Chinese), covering drafting, logical/semantic revision, translation, polishing, titles, labels, captions, notes, and UI copy; mixed-language content uses separate writer and zh-writer text-tool calls by segment; Main preserves semantic anchors and integrates the returned proposal verbatim.
  4. Then checker/zh-checker reports logic/evidence issues without rewriting prose; any substantive repair returns to the same language-matched text tool. Main integrates exact writer output, while Main/task/checker never rewrite prose; code, evidence collection, structural reordering, layout, conversion, validation, and other non-text actions may remain with Main/task.
  5. If the writer text tool cannot safely handle substantive English prose (or zh-writer Chinese prose), record that inability as a limitation rather than silently drafting through another role.
  6. For Word output, apply the approved writer/zh-writer content through officecli (docx skill) and verify with officecli validate and a rendered view; task may perform only structural, layout, conversion, and validation operations and must not change wording.
  7. For new Beamer decks, the writer/zh-writer text tool produces the Markdown content plan whose titles avoid the "XX：XX" label+colon+label pattern and read as coherent prose in deck order; confirm it with the user, let a separate task reconcile slide order and structure, then have the task convert the unchanged text-tool output into Beamer and begin layout.
  8. After either a new or existing Beamer deck reaches its final validated Beamer visual revision, branch optionally to PPTX output when requested: use the fixed external `beamer2pptx` Skill/repository at https://github.com/xdmlxdml/beamer2pptx/tree/main/beamer2pptx with the final validated PDF and corresponding `.tex`, macro, and font sources when available; a producing task performs only PPTX conversion, binding, rendering, and layout-only fixes, then one independent read-only reviewer checks the current PPTX renders. The producing task may apply at most one bounded layout-only fix, rerender fresh evidence, and the same reviewer confirms only those findings once. Keep this branch advisory with no automatic loop or hard gate; preserve visible content, formulas, slide order, and Markdown/Beamer sources, and return content or page-structure issues to the writer/zh-writer path, then to the Markdown plan and Beamer regeneration path.
  9. For substantial de-AI work, apply the format-humanizer/zh-format-humanizer rules one at a time before checking: a scan task inventories the tell families present, then one writer/zh-writer text-tool pass per found family runs strictly sequentially — Main verifies each pass output's semantic-anchor check and hands it to the next pass; all rewriting stays with the text tools and no pass mixes families.
  10. Check via checker/zh-checker for substantial work to report logic, semantic, and evidence issues; Main checks orchestration, preservation, and consistency only and never authors or edits text.
  11. Deliver with preservation and consistency verification.

## `research`

- When: Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.
- Skills: `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity`
- Agents (host runtime adapter labels): `fact-researcher-a`, `fact-researcher-b`, `fact-researcher-c`, `fact-challenger`, `fact-planner`, `scout`, `writer`, `zh-writer`
- Flow:
  1. Decompose into checkable claims or research questions.
  2. Collect evidence from primary sources; corroborate with multiple sources.
  3. Cross-check evidence lanes for agreement, conflicts, and staleness.
  4. Route all user-facing research text through the language-matched dedicated text tool before synthesis: English goes to writer, Chinese goes to zh-writer, and mixed-language output uses separate writer and zh-writer text-tool calls.
  5. The writer/zh-writer text tool drafts the source-linked synthesis with confidence levels; Main integrates the returned text verbatim.
  6. Review verdicts for overclaiming; report limitations without drafting or rewriting prose.

## `visual`

- When: Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.
- Skills: `drawio-skill`, `assetseeker`, `frontend-design`, `canvas-design`, `format-humanizer`, `zh-format-humanizer`
- Agents (host runtime adapter labels): `task`, `writer`, `zh-writer`
- Flow:
  1. Clarify the diagram type, target language, information claims, real nodes and directed relations (including conditions and grouping meaning), output paths, physical width, and any names, math symbols, or terms that must not change. Before drawing, route every user-facing English label, caption, narrative, and UI copy to the dedicated text tool writer and every Chinese equivalent to the dedicated text tool zh-writer (mixed-language output uses separate writer and zh-writer text-tool calls); task may perform only structural mapping, drawing, layout, export, and evidence-based review. For diagram-only branches, use drawio-skill (drawio@365-skills) plus the one authoring reference for the chosen method; optional asset prep happens only when the user asks for a more vivid diagram or the confirmed plan names image assets (assetseeker icons or stock; Main pre-generated via the native generate_image tool; bl image via bash for Chinese-text or photoreal nodes) with provenance recorded before drawing.
  2. After writer/zh-writer returns the copy, task derives a stable node/edge ID list from the source material, maps the text verbatim, then draws the diagram once with drawio-skill and exports: a preview PNG (no -e, longest side <= 2000), a cropped single-page vector PDF, and a final PNG (-e -s 2) repaired with the skill's repair_png.py. Ask the user only when the diagram meaning or physical size changes.
  3. Exactly one independent read-only review of the actual exports: Main when it has image input, otherwise one task that did not author the diagram. The reviewer checks node/edge semantics, edges crossing unrelated boxes, overlapping or collinear edges, arrow attribution, text clipping, font size at physical width, alignment, grouping margins, reading direction, gray-scale distinguishability, and the color quota (monochrome base plus at most one accent; no AI rainbow per-element or per-category color assignment); findings name node/edge IDs, location, and one executable local fix.
  4. The task applies at most one local structure/layout fix round for supported findings (keeping other node/edge IDs and positions), re-exports the same source set, and the same reviewer confirms against the fresh exports that recorded findings are resolved and no new regression was introduced; any text finding returns to writer/zh-writer instead of being edited by task or Main. This confirmation is not a second review pass or a new design round. Remaining findings are reported as limitations.
  5. Deliver the .drawio source plus the exports the task actually needs (default for paper/report: .drawio + cropped vector PDF + clean PNG); Main retains setup authorization and final acceptance only.

<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->
