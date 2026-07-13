---
name: latex-beamer-slides
description: Create or revise LaTeX Beamer presentations while preserving project templates, source structure, language rules, and visual style, with designer-owned layout refinement and independent visioner review of fresh renders. Use for new Beamer decks, slide-by-slide `.tex` generation, edits to existing Beamer slides, template readiness checks, compilation, rendered-slide QA, or a Beamer deck that may later be converted to PowerPoint with a separate user-provided command.
---

# LaTeX Beamer Slides

Choose the generation or modification path from the requested operation. Do not run generation-only interviews during an ordinary modification.

## Apply shared rules

1. Read the project instructions, exact Beamer entry point, local theme files, frame sources, assets, and native build commands before editing.
2. Treat Beamer as a LaTeX format workflow. For an existing deck, choose Chinese or English writing skills from the body being changed, not from the instruction language. For a new deck, use the explicitly agreed output language.
3. For Chinese, load `plain-chinese-writing` and normally `zh-writing-review`; add `zh-writing-polish` only for actual polishing. For English, load `writing-review`. Use broad checker or humanizer skills only when the user requests that broader review or the text provides concrete evidence for it.
4. Preserve semantic anchors: qualifiers, modality, scope, negation, comparisons, causal direction, numbers, units, citations, identifiers, math, cross-references, commands, comments, labels, and revision markers.
5. Preserve escaped LaTeX text such as `\%`. Do not turn it into a comment marker or rewrite custom macros without need.
6. Do not invent facts, citations, results, logos, brand rules, or visual assets.

Read [references/beamer-quality.md](references/beamer-quality.md) before a template readiness check, generation pass, or rendered-slide QA.

## Generate a new deck

1. Inspect template readiness before drafting slide content. Identify the Beamer main file, theme and style assets, logo decision, aspect ratio, typography, color system, layout conventions, frame organization, compiler, and build command.
2. Run the smallest compile smoke test that demonstrates the configured template works. Treat a missing, ambiguous, unresolved, or non-compiling template as not configured.
3. If the template is not configured, stop content generation and discuss the template with the user first. Cover visual character, logo or explicit no-logo choice, aspect ratio, fonts, colors, title and section pages, header and footer, margins, content density, code and figure layouts, and source organization. Reuse choices already supplied instead of asking again.
4. After the template is ready, load `slides-storyline`. Discuss purpose, audience, duration, output language, key takeaway, evidence, and a numbered slide outline. Obtain user confirmation before authoring frames.
5. Generate the deck from the confirmed template and outline. Keep the main file structural and use one frame file per slide when the project follows that layout. Mark generated frame files and delete or replace only files carrying that marker; never erase handcrafted frames merely because their names match a pattern.
6. Keep one main job per slide. Prefer visuals, examples, diagrams, or short code over dense prose. Split overflowing content instead of making it unreadably small.
7. Compile with the native engine for enough passes to resolve navigation and references. Render every page so `designer` receives an initial PDF and current page images.
8. Have `designer` perform the final layout pass across the deck. Correct text and image overlap, crowding, clipping, undersized text, cropped or distorted figures, inconsistent margins, weak alignment, and unclear hierarchy. Preserve the confirmed story and template. Split an overloaded slide instead of shrinking it below the readable baseline.
9. Reconcile the designer revision against the confirmed outline, output language, source facts, semantic anchors, and LaTeX structure. Restore any unintended content, frame-order, or scope change before rendering.
10. Recompile and render the designer revision. Bind one revision identifier, the PDF, the render directory, fresh renders of every page, and an overview or contact sheet. Do not give `visioner` pre-designer or mixed-revision evidence.
11. Have `visioner` independently inspect the latest rendered pages and overview for text and image overlap, crowding, clipping, undersized text, image treatment, margins, alignment, whitespace, hierarchy, and cross-slide consistency. Require exactly `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for the supplied revision. Do not accept `PASS` or `FAIL` as a substitute. Treat source inspection, compile success, and designer self-review as insufficient visual evidence.
12. For `CHANGES_REQUIRED`, have `designer` address every blocker and major finding and create a new revision. Reconcile content and scope again, then recompile and generate fresh renders before another vision review. Use a maximum of three vision review rounds. Do not review an unchanged artifact; if material findings remain, report the limitation instead of claiming completion.
13. Load `beamer-to-powerpoint` only when the user explicitly supplied a conversion command and PowerPoint output is in scope. Convert only after the final Beamer revision is approved by `visioner`.

Do not claim generation is complete while template choices or the story outline still await user confirmation.

## Modify an existing deck

1. Read the exact requested frames and enough surrounding source to identify the current wording, language, macros, and visual conventions.
2. Apply only the requested wording, language-norm, and existing-style changes. Preserve the story arc, frame order, template, logo, layout system, math, citations, code, and unrelated content unless the user explicitly expands scope.
3. Match the existing title pattern, terminology, capitalization, spacing, color roles, content density, and figure treatment. Do not redesign the template or reopen story planning.
4. Compare semantic and LaTeX anchors once after editing. Compile and render the affected deck when a build is available, then identify the changed frames and any pages whose layout they can influence.
5. Have `designer` perform a final layout pass on the changed frames and any pages whose layout they can influence. Correct text and image overlap, crowding, clipping, undersized text, cropped or distorted figures, alignment, and spacing while preserving the existing template, story, and visual style.
6. Reconcile the designer revision against the requested semantic diff, LaTeX anchors, and authorized scope. Restore unintended wording, math, citations, frame order, or unrelated changes before rendering.
7. Recompile and render the designer revision. Bind one revision identifier, the PDF, the render directory, fresh high-resolution renders of every affected page, and a current full-deck overview or contact sheet. If a shared template, style, or macro changed, render and review every page.
8. Have `visioner` independently review the latest renders for text and image overlap, crowding, clipping, undersized text, image treatment, margins, readability, and consistency with the existing deck. Require exactly `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for the supplied revision. Do not accept `PASS` or `FAIL` as a substitute.
9. For `CHANGES_REQUIRED`, have `designer` make only the necessary bounded fix and create a new revision. Reconcile semantics and scope again, then recompile and generate fresh rerenders before another vision review. Use a maximum of three vision review rounds. Report unresolved blocker or major findings honestly.

Do not require template discussion or a story-outline checkpoint merely because an existing deck lacks a separate template manifest. Do not widen the edit to unrelated pre-existing layout defects. Do not split, add, remove, or reorder frames without explicit user authorization. Escalate only a concrete ambiguity that prevents the requested edit.

## Hand off

Report the main `.tex` file, generated or changed frame files, final revision identifier, output PDF, compiler command, render directory, designer and visioner QA evidence, and unresolved warnings. If conversion was requested, report the verified PowerPoint artifact separately.
