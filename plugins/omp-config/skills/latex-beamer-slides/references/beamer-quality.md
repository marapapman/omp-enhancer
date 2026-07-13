# Beamer template and quality reference

Use this reference for generation and QA. Apply project-specific instructions first.

## Template readiness

Treat a template as configured only when the available evidence answers these questions and a compile smoke succeeds:

- Which `.tex` file is the main Beamer entry point?
- Which theme, color theme, font theme, `.sty`, or `.cls` files define the visual identity?
- Is the logo choice explicit, including an intentional no-logo choice, and do referenced assets resolve?
- Are aspect ratio, fonts, colors, margins, title page, section page, frame title, header, footer, and page numbering intentional?
- How are ordinary text, figures, tables, equations, quotations, and code laid out?
- Are frames inline or stored one per file, and which files are generated versus handcrafted?
- Which engine and command build the deck, and how many passes are required?

Static files alone do not prove success. Compile the smallest representative deck with the native engine. Require a non-empty PDF and no fatal LaTeX error, unresolved required asset, or missing glyph in active slide text. Treat visible clipping or overflow as a failed template smoke.

When readiness is incomplete, discuss the missing decisions with the user. Do not silently copy a familiar institutional template or logo into an unrelated project.

## Generation structure

Prefer a stable main file that contains metadata, theme setup, document structure, and ordered `\input` statements. Store one frame per source file when that matches the project. Use sortable names such as `001-topic.tex`.

If frames are generated mechanically, add a clear generated-file marker. Cleanup may remove only files carrying that marker. Preserve unmarked frame files.

Use `[fragile]` for frames that require verbatim content. Use `[shrink]` only when the chosen template or project requires it, and still inspect the rendered result. Shrink is not a substitute for splitting an overloaded slide.

## Density and legibility

- Give each frame one main point or job.
- Keep ordinary bullet lists near six items or fewer.
- Keep code examples short enough to read from the back of the room; split long examples into staged frames.
- Prefer a diagram, table, image, or worked example when it communicates the point more directly than prose.
- Preserve consistent title length, margins, alignment, color roles, and figure treatment.
- Do not solve overflow by reducing text below the template's readable baseline.
- Avoid a cramped composition. Preserve enough whitespace and separation among titles, body text, figures, captions, code, tables, equations, and page furniture to make grouping unambiguous.

## Build and rendered QA

Run the native compiler for enough passes to resolve the table of contents, navigation, labels, and references. A common XeLaTeX project needs two passes, but the project command is authoritative.

Inspect the build log for at least:

- fatal LaTeX errors
- overfull boxes
- missing characters or glyphs
- unresolved files, citations, or references
- unexpected shrink warnings

Render every PDF page to an image when local tools allow it. Keep full-resolution page renders and an overview or contact sheet from the same revision. Bind the revision identifier, PDF, page count, and render directory so a reviewer cannot accidentally mix old and new evidence. Verify:

- PDF page count equals the rendered page count
- no page is blank or nearly blank unless intentional
- no text, code, equation, table, logo, or figure is clipped
- no text and image overlap, including collisions with tables, code, equations, captions, logos, headers, footers, or slide numbers
- no element crosses the intended frame boundary, margin, gutter, title region, header, or footer
- no cropped or distorted image, unexpected stretching, or unreadably small figure label
- no cramped composition, collapsed padding, or visually ambiguous grouping
- fonts and multilingual glyphs render correctly
- figures are sharp and preserve aspect ratio
- page furniture is consistent
- content remains readable at presentation distance

For a new deck, review every full-resolution page and the deck overview. For a bounded modification, review the full-deck overview plus every changed page and every page influenced by the change; review all pages after a shared template, style, or macro edit.

Record warnings honestly. Do not report visual QA from compilation alone. Source inspection, designer self-review, an old render, or a contact sheet without inspectable page renders cannot substitute for current-revision `visioner` evidence.
