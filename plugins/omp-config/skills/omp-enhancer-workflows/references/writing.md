# writing workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.

## `writing.pending`

- Use when: A writing task names a target but the text being changed has not been observed yet.
- May compose with: `writing.latex`, `slides.modify`, `writing.markdown`, `doc.convert.word`.
- Reference steps: (1) [step-1] Read the exact text or document section. (2) [step-2] Detect its body language. (3) [step-3] Compose writing.zh or writing.en with any format companion. (4) [step-4] Revise and review.
- Optional skills: none suggested.
- Optional Agent candidates: none suggested.
- Optional delegation ideas: step-1: before the body language is observed, do not delegate to writer, checker, zh-writer, or zh-checker; step-3: after detecting the body language, compose writing.zh or writing.en and use only that workflow's language-matched subagents.
- Quality checks: preserve meaning, anchors, markup, and document structure.
- Scope notes: The instruction language is not evidence of the document language; Language-specific skills remain undecided until source text is available.
- Risk notes: none.

## `writing.zh`

- Use when: The prose being drafted or revised is Chinese, regardless of the instruction language.
- May compose with: `writing.latex`, `slides.generate`, `slides.modify`, `diagram.svg`, `writing.markdown`, `doc.convert.word`, `research.web`, `factcheck.document`.
- Reference steps: (1) [step-1] Establish meaning, preservation constraints, and the bounded assignment. (2) [step-2] Have zh-writer draft or revise the requested natural Chinese prose. (3) [step-3] Have zh-checker independently review the resulting revision for logic, tone, terminology, readability, and semantic drift without editing the source. (4) [step-4] Have zh-writer apply only parent-accepted findings once, then have the parent verify scope, voice consistency, semantic anchors, and requested format.
- Optional skills: `plain-chinese-writing`, `zh-writing-review`, `zh-writing-polish`, `zh-writing-checkers`.
- Optional Agent candidates: `zh-writer`, `zh-checker`.
- Optional delegation ideas: step-2: zh-writer owns the requested Chinese drafting or prose revision; step-3: zh-checker independently reviews the resulting revision without editing the source; step-4: zh-writer applies only parent-accepted findings once, then the parent verifies scope and semantic anchors.
- Quality checks: meaning and semantic-anchor preservation, Chinese logic and style, terminology consistency, independent checker evidence, parent scope reconciliation, and requested format.
- Scope notes: This route concerns prose rather than code implementation; The language-matched writer owns prose edits, the checker remains independent and source-read-only, and the parent owns assignment boundaries and final reconciliation.
- Risk notes: none.

## `writing.en`

- Use when: The prose being drafted or revised is English, regardless of the instruction language.
- May compose with: `writing.latex`, `slides.generate`, `slides.modify`, `diagram.svg`, `writing.markdown`, `doc.convert.word`, `research.web`, `factcheck.document`.
- Reference steps: (1) [step-1] Establish meaning, preservation constraints, and the bounded assignment. (2) [step-2] Have writer draft or revise the requested English prose. (3) [step-3] Have checker independently review the resulting revision for logic, tone, terminology, formatting, readability, and semantic drift without editing the source. (4) [step-4] Have writer apply only parent-accepted findings once, then have the parent verify scope, voice consistency, semantic anchors, and requested format.
- Optional skills: `writing-review`, `writing-checkers`, `writing-markdown-helper`.
- Optional Agent candidates: `writer`, `checker`.
- Optional delegation ideas: step-2: writer owns the requested English drafting or prose revision; step-3: checker independently reviews the resulting revision without editing the source; step-4: writer applies only parent-accepted findings once, then the parent verifies scope and semantic anchors.
- Quality checks: meaning and semantic-anchor preservation, English logic and style, terminology consistency, independent checker evidence, parent scope reconciliation, and requested venue or format.
- Scope notes: This route concerns prose rather than code implementation; The language-matched writer owns prose edits, the checker remains independent and source-read-only, and the parent owns assignment boundaries and final reconciliation.
- Risk notes: none.

## `writing.latex`

- Use when: The target artifact is LaTeX; compose this format workflow with the prose language workflow.
- May compose with: `writing.pending`, `writing.zh`, `writing.en`, `slides.generate`, `slides.modify`, `research.web`, `factcheck.document`.
- Reference steps: (1) [step-1] Read the relevant source and local macros. (2) [step-2] Preserve commands, comments, citations, math, labels, and revision markers. (3) [step-3] Make the requested change. (4) [step-4] Inspect the diff and compile when in scope.
- Optional skills: `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`.
- Optional Agent candidates: none suggested.
- Optional delegation ideas: step-3: for prose changes, use the writer from the composed writing.zh or writing.en workflow; keep format-only conversion language-neutral; step-4: use the composed language checker for prose review; otherwise the parent owns compile evidence unless another explicitly composed workflow supplies an exact role.
- Quality checks: LaTeX structure, active-text boundaries, reference integrity, and compile evidence when requested.
- Scope notes: Compilation and publication are separate workflow steps when requested.
- Risk notes: none.

## `slides.generate`

- Use when: The user wants a new LaTeX Beamer deck, with template and story decisions completed before frame authoring.
- May compose with: `writing.zh`, `writing.en`, `writing.latex`, `diagram.svg`, `design.visual`, `research.web`, `factcheck.document`.
- Reference steps: (1) [step-1] Inspect project instructions, the template, compiler, and any explicitly supplied conversion command. (2) [step-2] Validate template readiness through the Beamer entry point, theme, logo decision, layout assets, and a compile smoke. (3) [step-3] If the template is not ready, discuss its style, logo, aspect ratio, typography, and layout with the user and configure it first. (4) [step-4] Discuss the purpose, audience, duration, output language, and numbered story outline with the user and obtain confirmation. (5) [step-5] Generate Beamer frames from the confirmed template and outline, composing writing.zh or writing.en from the agreed output language. (6) [step-6] Compile and render the draft deck so the designer receives an initial PDF and page images. (7) [step-7] Have the designer perform the final layout pass across the deck, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, spacing, and hierarchy without changing the confirmed story. (8) [step-8] Reconcile the designer revision against the confirmed outline, output language, source facts, semantic anchors, and LaTeX structure; restore unintended content or scope changes before rendering. (9) [step-9] Recompile and render the designer revision; bind the revision identifier, PDF, render directory, fresh renders of every page, and an overview or contact sheet. (10) [step-10] Have the visioner independently inspect the latest rendered pages and overview or contact sheet for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and cross-slide consistency, then return exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision. (11) [step-11] For each material finding, have the designer produce a new revision, have the parent reconcile content and scope, then recompile and create fresh renders before visioner review; use a maximum of three vision review rounds and never review an unchanged artifact. (12) [step-12] Only when the user supplied a conversion command, run it after the final Beamer revision passes visioner review and verify the PowerPoint artifact.
- Optional skills: `latex-beamer-slides`, `slides-storyline`, `beamer-to-powerpoint`.
- Optional Agent candidates: `designer`, `visioner`.
- Optional delegation ideas: step-7: designer owns the final layout pass and every layout revision; step-10: visioner independently reviews the latest rendered pages and deck overview; step-11: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders.
- Quality checks: template readiness, confirmed story outline, post-layout semantic and LaTeX preservation, output-language writing compliance, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, compile evidence, and user-command conversion evidence when requested.
- Scope notes: Template discussion precedes story discussion when configuration is incomplete; A familiar template or converter is not a substitute for the user-selected template or command; The designer owns slide-layout changes and the visioner remains read-only; source inspection, compile success, or designer self-review does not replace current-revision visual evidence.
- Risk notes: none.

## `slides.modify`

- Use when: The user wants bounded wording, language, or existing-style changes to a current LaTeX Beamer deck.
- May compose with: `writing.pending`, `writing.zh`, `writing.en`, `writing.latex`.
- Reference steps: (1) [step-1] Read the exact target, body language, current template and style, and local build commands. (2) [step-2] Compose writing.zh or writing.en from the slide body and preserve LaTeX structure and semantic anchors. (3) [step-3] Apply only the requested wording, language-norm, and existing-style changes while preserving story order, template, logo, layout, math, citations, code, and unrelated content. (4) [step-4] Compile and render the affected deck, then inspect the semantic diff and identify the changed frames and any pages whose layout they can influence. (5) [step-5] Have the designer perform a final layout pass on the changed frames and affected pages, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, and spacing while preserving the existing visual style. (6) [step-6] Reconcile the designer revision against the requested semantic diff, LaTeX anchors, and authorized scope; restore any unintended wording, math, citation, frame-order, or unrelated change before rendering. (7) [step-7] Recompile and render the designer revision; bind the revision identifier, PDF, render directory, fresh high-resolution affected-page renders, and a current full-deck overview or contact sheet. (8) [step-8] Have the visioner independently review the latest renders for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and consistency with the existing deck, then return exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision. (9) [step-9] For each material finding, have the designer make only the necessary bounded fix, have the parent reconcile semantics and scope, then recompile and create fresh rerenders before visioner review; use a maximum of three vision review rounds and report any unresolved limitation.
- Optional skills: `latex-beamer-slides`.
- Optional Agent candidates: `designer`, `visioner`.
- Optional delegation ideas: step-5: designer owns the bounded final layout pass and any resulting source revision; step-8: visioner independently reviews the latest affected-page renders; step-9: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders.
- Quality checks: requested-scope preservation after every layout revision, source-language writing compliance, semantic and LaTeX anchor preservation, existing visual-style consistency, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, and compile evidence when in scope.
- Scope notes: Do not reopen template selection or story planning for an ordinary modification; A path-only request remains language-pending until the target body is read; Do not widen scope to unrelated pre-existing layout defects; shared template or macro changes expand visual review to every page they can affect; The designer owns bounded layout revisions and the visioner remains read-only; review only evidence from the current revision.
- Risk notes: none.

## `diagram.svg`

- Use when: The user wants a standalone SVG workflow, process, block, or box diagram with strict monochrome geometry and rendered visual QA.
- May compose with: `design.visual`, `slides.generate`, `writing.zh`, `writing.en`.
- Reference steps: (1) [step-1] Establish the output path, display size, node and edge model, labels, branch semantics, dashed-line meaning, and primary flow direction. (2) [step-2] Have the designer create the standalone SVG in black and white using only simple shapes, straight or dashed lines, and orthogonal polylines, with no curved connectors. (3) [step-3] Run the static checker, render the current revision at full size and 60% scale, and retain fresh raster evidence. (4) [step-4] Have the visioner independently inspect the latest rasters for semantic accuracy, overlaps, text fit, connector collisions, crossings, spacing, and readability. (5) [step-5] For each material finding, have the designer produce a new revision, rerun validation and rendering, then have the visioner review that revision; use a maximum of three vision review rounds and relayout after repeated geometry failures. (6) [step-6] Deliver only after final source validation and current-revision rendered evidence; otherwise report the remaining layout or review limitation.
- Optional skills: `svg-flowchart`.
- Optional Agent candidates: `designer`, `visioner`.
- Optional delegation ideas: step-2: designer creates the SVG and owns every source revision; step-4: visioner independently reviews the fresh full-size and 60% raster renders; step-5: designer applies findings and visioner reviews only the resulting new revision.
- Quality checks: node and edge completeness, arrow direction, zero unintended overlap or text clipping, zero connector collision or avoidable crossing, readable font size, balanced spacing, strict monochrome geometry, and current-revision rendered evidence.
- Scope notes: The designer owns SVG changes and the visioner remains read-only; the main agent coordinates revisions; Do not substitute source inspection or designer self-review for rendered visioner evidence; Review only fresh revisions; do not rerun unchanged reviews.
- Risk notes: none.

## `writing.markdown`

- Use when: The target artifact is Markdown; compose this format workflow with the prose language workflow.
- May compose with: `writing.pending`, `writing.zh`, `writing.en`, `research.web`, `factcheck.document`.
- Reference steps: (1) [step-1] Read the source and local conventions. (2) [step-2] Make the requested revision or conversion. (3) [step-3] Review headings, lists, links, citations, and code fences. (4) [step-4] Render or verify when in scope.
- Optional skills: `writing-markdown-helper`, `zh-writing-markdown-helper`.
- Optional Agent candidates: none suggested.
- Optional delegation ideas: step-2: for prose changes, use the writer from the composed writing.zh or writing.en workflow; keep format-only conversion language-neutral; step-3: use the composed language checker for prose review while the parent reconciles Markdown structure.
- Quality checks: Markdown structure, link and fence integrity, and consistent prose.
- Scope notes: Code mentioned inside prose does not by itself make this a code implementation task.
- Risk notes: none.

## `doc.convert.word`

- Use when: The requested output is a Word document or a conversion to or from Word.
- May compose with: `writing.pending`, `writing.zh`, `writing.en`, `research.web`.
- Reference steps: (1) [step-1] Inspect source and target format. (2) [step-2] Confirm output location and preservation needs. (3) [step-3] Create or convert. (4) [step-4] Review headings, tables, figures, and document structure.
- Optional skills: `docx`.
- Optional Agent candidates: none suggested.
- Optional delegation ideas: step-3: keep pure conversion language-neutral; when prose changes are requested, use the writer from the composed writing.zh or writing.en workflow; step-4: use the composed language checker for revised prose; otherwise the parent owns document-structure and visual review unless another explicitly composed workflow supplies an exact role.
- Quality checks: source fidelity, target readability, output existence, and overwrite awareness.
- Scope notes: Source preservation and overwrite risk deserve explicit attention.
- Risk notes: Confirm the intended output path before replacing an existing document.
