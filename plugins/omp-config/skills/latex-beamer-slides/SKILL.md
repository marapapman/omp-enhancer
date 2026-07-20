---
name: latex-beamer-slides
description: Create or revise LaTeX Beamer presentations while preserving project templates, source structure, language rules, and visual style, with designer-owned layout refinement and independent visioner review of fresh renders. Use for new Beamer decks, slide-by-slide `.tex` generation, edits to existing Beamer slides, template readiness checks, compilation, rendered-slide QA, or a Beamer deck that may later be converted to PowerPoint with a separate user-provided command. In a staged workflow, declare applicable visible language, storyline, and authorized conversion dependencies in WORKFLOW PLAN and load them before WORKFLOW READY instead of late-loading them during execution.
---

# LaTeX Beamer Slides

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Choose the generation or modification path from the requested operation. Do not run generation-only interviews during an ordinary modification.

Agent availability and capacity remain Main decisions. `designer` and `visioner` are soft candidates when currently exposed and a safe complete assignment can be formed. Their absence, an unavailable renderer, or review findings are limitations to report, not plugin-owned completion permission. No review verdict grants permission to convert, publish, or complete.

## Stage dependent Skills before READY

This timing aligns the Beamer method with the host's staged resource protocol. It is planning guidance, not a router, gate, permission check, or completion controller.

1. In `WORKFLOW PLAN`, Main independently declares the exact Skill URIs for `latex-beamer-slides` and only the applicable dependencies currently visible in the native inventory: the language method selected from the slide body or agreed output language; `slides-storyline` for a new deck; and `beamer-to-powerpoint` only when PowerPoint output and an exact user-supplied conversion command are already in scope.
2. In the domain-Skill portion of `Load order`, put the applicable language Skills first, then `latex-beamer-slides`, `slides-storyline` for generation, and the conditional `beamer-to-powerpoint`; put selected workflow references after them, with Add-ons before the Primary reference. Omit dependencies that do not apply to the requested path.
3. In the `WORKFLOW PLAN` response, read the declared top-level Skills and wait. This loaded Skill explicitly reveals exact URI `skill://latex-beamer-slides/references/beamer-quality.md` for template readiness, generation, and rendered-slide QA. Before workflow references, emit `RESOURCE EXTENSION | source=skill://latex-beamer-slides | reads=skill://latex-beamer-slides/references/beamer-quality.md` at visible byte 0, read only that exact URI in this one resource-only extension batch, and wait. Then load declared workflow references in one final resource-only batch. Wait for every declared resource result before `WORKFLOW READY`.
4. This soft pre-READY extension is no re-PLAN, router, gate, retry, permission, or completion control. When an applicable dependency is not visible, or an exact-URI read fails, record its bare name in `skills-unavailable`, retain the limitation, and never guess a URI.
5. After `WORKFLOW READY`, apply only loaded resources. Do not issue a new Skill read, reopen `WORKFLOW PLAN + LOAD`, or silently add a later dependency; record it as a limitation.

## Apply shared rules

1. Read the project instructions, exact Beamer entry point, local theme files, frame sources, assets, and native build commands before editing.
2. Treat Beamer as a LaTeX format workflow. For an existing deck, choose Chinese or English writing skills from the body being changed, not from the instruction language. For a new deck, use the explicitly agreed output language.
3. Apply the language Skills already declared and loaded during `WORKFLOW PLAN + LOAD`. For Chinese, use `plain-chinese-writing` and normally `zh-writing-review`; include `zh-writing-polish` only for actual polishing. For English, use `writing-review`. Use broad checker or humanizer skills only when the user requests that broader review or the text provides concrete evidence for it.
4. Preserve semantic anchors: qualifiers, modality, scope, negation, comparisons, causal direction, numbers, units, citations, identifiers, math, cross-references, commands, comments, labels, and revision markers.
5. Preserve escaped LaTeX text such as `\%`. Do not turn it into a comment marker or rewrite custom macros without need.
6. Do not invent facts, citations, results, logos, brand rules, or visual assets.

Apply the PLAN-loaded `skill://latex-beamer-slides/references/beamer-quality.md` before a template readiness check, generation pass, or rendered-slide QA.

## Generate a new deck

1. Inspect template readiness before drafting slide content. Identify the Beamer main file, theme and style assets, logo decision, aspect ratio, typography, color system, layout conventions, frame organization, compiler, and build command.
2. Run the smallest compile smoke test that demonstrates the configured template works. Treat a missing, ambiguous, unresolved, or non-compiling template as not configured.
3. If the template is not configured and its choices materially change the requested result, discuss only the missing choices with the user. Cover visual character, logo or explicit no-logo choice, aspect ratio, fonts, colors, title and section pages, header and footer, margins, content density, code and figure layouts, and source organization. Reuse choices already supplied instead of asking again; when the user authorized a plain/default template and the assumptions are safe, state them and proceed.
4. After the template path is committed, apply the PLAN-loaded `slides-storyline` method. Establish purpose, audience, duration, output language, key takeaway, evidence, and a numbered slide outline. Ask the user only when a missing choice materially changes the deck; otherwise state explicit assumptions and commit the working outline to Main's plan. If the Skill was recorded unavailable, use this bounded outline method directly and retain that limitation.
5. Generate the deck from the committed template and outline. Keep the main file structural and use one frame file per slide when the project follows that layout. Mark generated frame files and delete or replace only files carrying that marker; never erase handcrafted frames merely because their names match a pattern.
6. Keep one main job per slide. Prefer visuals, examples, diagrams, or short code over dense prose. Split overflowing content instead of making it unreadably small.
7. Compile with the native engine for enough passes to resolve navigation and references. Render every page so `designer` receives an initial PDF and current page images.
8. Have `designer` perform the final layout pass across the deck. Correct text and image overlap, crowding, clipping, undersized text, cropped or distorted figures, inconsistent margins, weak alignment, and unclear hierarchy. Preserve the confirmed story and template. Split an overloaded slide instead of shrinking it below the readable baseline.
9. Reconcile the designer revision against the committed outline, output language, source facts, semantic anchors, and LaTeX structure. Restore any unintended content, frame-order, or scope change before rendering.
10. Recompile and render the designer revision. Bind one revision identifier, the PDF, the render directory, fresh renders of every page, and an overview or contact sheet. Do not give `visioner` pre-designer or mixed-revision evidence.
11. Have `visioner` independently inspect the latest rendered pages and overview for text and image overlap, crowding, clipping, undersized text, image treatment, margins, alignment, whitespace, hierarchy, and cross-slide consistency. Require exactly `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for the supplied revision. Do not accept `PASS` or `FAIL` as a substitute. Treat source inspection, compile success, and designer self-review as insufficient visual evidence.
12. Treat `CHANGES_REQUIRED` as advisory findings returned to Main. A supported finding selected for repair becomes a new bounded TODO checkpoint; Main may assign the affected layout slice to an exposed `designer`, reconcile and rerender it, then request at most one fresh affected review. Do not redispatch automatically or review an unchanged artifact. Report material findings that remain.
13. Apply the PLAN-loaded `beamer-to-powerpoint` method only when the user explicitly supplied a conversion command and PowerPoint output is in scope. Main verifies the chosen Beamer revision and the user's conversion authority; `visioner` approval is evidence, not conversion permission. If conversion was requested but the Skill was recorded unavailable, report the limitation and do not invent a converter.

No review verdict grants permission to convert, publish, or complete.

Keep unresolved material template or story choices visible. Ask the user only when they prevent a safe committed outline; do not manufacture a second approval checkpoint.

## Modify an existing deck

1. Read the exact requested frames and enough surrounding source to identify the current wording, language, macros, and visual conventions.
2. Apply only the requested wording, language-norm, and existing-style changes. Preserve the story arc, frame order, template, logo, layout system, math, citations, code, and unrelated content unless the user explicitly expands scope.
3. Match the existing title pattern, terminology, capitalization, spacing, color roles, content density, and figure treatment. Do not redesign the template or reopen story planning.
4. Compare semantic and LaTeX anchors once after editing. Compile and render the affected deck when a build is available, then identify the changed frames and any pages whose layout they can influence.
5. Have `designer` perform a final layout pass on the changed frames and any pages whose layout they can influence. Correct text and image overlap, crowding, clipping, undersized text, cropped or distorted figures, alignment, and spacing while preserving the existing template, story, and visual style.
6. Reconcile the designer revision against the requested semantic diff, LaTeX anchors, and authorized scope. Restore unintended wording, math, citations, frame order, or unrelated changes before rendering.
7. Recompile and render the designer revision. Bind one revision identifier, the PDF, the render directory, fresh high-resolution renders of every affected page, and a current full-deck overview or contact sheet. If a shared template, style, or macro changed, render and review every page.
8. Have `visioner` independently review the latest renders for text and image overlap, crowding, clipping, undersized text, image treatment, margins, readability, and consistency with the existing deck. Require exactly `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for the supplied revision. Do not accept `PASS` or `FAIL` as a substitute.
9. Treat `CHANGES_REQUIRED` as advisory findings returned to Main. A supported finding selected for repair becomes a new bounded TODO checkpoint; Main may assign only the affected layout slice, reconcile semantics and scope, rerender it, and request at most one fresh affected review. Do not redispatch automatically. Report unresolved blocker or major findings honestly.

Do not require template discussion or a story-outline checkpoint merely because an existing deck lacks a separate template manifest. Do not widen the edit to unrelated pre-existing layout defects. Do not split, add, remove, or reorder frames without explicit user authorization. Escalate only a concrete ambiguity that prevents the requested edit.

## Hand off

Report the main `.tex` file, generated or changed frame files, final revision identifier, output PDF, compiler command, render directory, designer and visioner QA evidence, and unresolved warnings. If conversion was requested, report the verified PowerPoint artifact separately.
