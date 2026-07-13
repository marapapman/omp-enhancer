---
name: latex-beamer-slides
description: Create or revise LaTeX Beamer presentations while preserving project templates, source structure, language rules, and visual style. Use for new Beamer decks, slide-by-slide `.tex` generation, edits to existing Beamer slides, template readiness checks, compilation, rendered-slide QA, or a Beamer deck that may later be converted to PowerPoint with a separate user-provided command.
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
7. Compile with the native engine for enough passes to resolve navigation and references. Render every page and inspect it for clipping, overflow, missing glyphs, blank-like pages, broken assets, inconsistent spacing, and unreadable code or figures.
8. Load `beamer-to-powerpoint` only when the user explicitly supplied a conversion command and PowerPoint output is in scope. Convert only after the Beamer PDF passes its checks.

Do not claim generation is complete while template choices or the story outline still await user confirmation.

## Modify an existing deck

1. Read the exact requested frames and enough surrounding source to identify the current wording, language, macros, and visual conventions.
2. Apply only the requested wording, language-norm, and existing-style changes. Preserve the story arc, frame order, template, logo, layout system, math, citations, code, and unrelated content unless the user explicitly expands scope.
3. Match the existing title pattern, terminology, capitalization, spacing, color roles, content density, and figure treatment. Do not redesign the template or reopen story planning.
4. Compare semantic and LaTeX anchors once after editing. Compile and render the affected deck when a build is available, then inspect the changed frames and any pages whose layout they can influence.

Do not require template discussion or a story-outline checkpoint merely because an existing deck lacks a separate template manifest. Escalate only a concrete ambiguity that prevents the requested edit.

## Hand off

Report the main `.tex` file, generated or changed frame files, output PDF, compiler command, QA evidence, and unresolved warnings. If conversion was requested, report the verified PowerPoint artifact separately.
