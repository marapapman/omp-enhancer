---
name: format-template-latex
description: "Apply a named or provided LaTeX venue template and its formatting requirements. Use only when template application is requested. Not for ordinary LaTeX prose review, correction, conversion, or drafting."
---

# Format Template LaTeX

Apply a conference or journal LaTeX template to an existing paper markdown. Merge content sections into the template, handle double-column formatting, author blocks, citation style, and bibliography wiring.

## Workflow

1. **Identify template files.** Look for a `templates/latex/` directory in the project. If none exists, ask the user to provide the venue template. Do not invent or download templates. If multiple `.tex` files look like main files, ask which to use.

2. **Extract content sections from markdown.** Read the paper markdown file. Collect title, abstract, author info, section bodies (`## Introduction`, `## Method`, etc.), and bibliography references. Preserve inline math (`$...$`, `$$...$$`), citations, and figure references.

3. **Map sections to template structure.** Match extracted content to template placeholders:
   - `# Title` → `\title{...}` or template title placeholder
   - `## Abstract` → `\begin{abstract}...\end{abstract}`
   - Author lines → `\author{...}` using template's author block format
   - `## Section` → `\section{...}`, `### Subsection` → `\subsection{...}`
   - Bibliography references → `\bibliography{...}` or `\printbibliography`

4. **Apply template formatting.** Adapt content to the template's style:
   - **Column width**: Wrap body content in `\twocolumn{...}` for double-column templates; leave as-is for single-column.
   - **Font sizes**: Match template preamble (no manual `\small`/`\footnotesize` unless the template uses them).
   - **Author block**: Format authors and affiliations per the template's `\author{}` convention (e.g., `\author[1]{Name}` with `\affil[1]{Affiliation}` for `authblk`).
   - **Citation style**: Use the template's existing `\bibliographystyle{...}`; do not change it.

5. **Generate template-applied `.tex` file.** Create or update `target/latex/`. Write the merged `.tex` file. Copy template auxiliary files (`.cls`, `.sty`, `.bst`, images) and the `.bib` file (if present) into the output directory.

## Constraints

- **Do not modify** the original template files in `templates/latex/`. Generated output goes to `target/latex/`.
- **Do not fabricate** author names, affiliations, citations, venue names, or results.
- **Preserve** template license comments, package loads, and `\documentclass` options.
- **Handle double-column** by wrapping the body or relying on the template's `\documentclass[twocolumn]{...}` setting — do not force a column mode the template does not support.
- **Handle author blocks** by detecting the template's author convention (`\author` + `\affil` from `authblk.sty`, or `\author{Name\\Affiliation}` inline). Match the existing style.
- If the template has a `CONTENT_HERE` placeholder, use it. Otherwise, replace the body between `\begin{document}` and the bibliography/backmatter commands.

## Output

Report the output directory and main `.tex` file path. If a LaTeX engine is available and the user requests compilation, run `pdflatex`/`xelatex` from the output directory.
