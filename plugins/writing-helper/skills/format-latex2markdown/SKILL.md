---
name: format-latex2markdown
description: "Convert LaTeX to Markdown while preserving structure, citations, and math. Use only when Markdown output or format conversion is requested. Not for reviewing, correcting, or drafting LaTeX prose without conversion."
---

# LaTeX → Markdown Conversion Skill

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

Use `pandoc -f latex -t markdown` to convert a `.tex` file to `.md`, then verify and fix three common problems.

## When to Use

- User provides a `.tex` file and wants `.md` output
- User says "convert this LaTeX paper to markdown" or similar

## Instructions

### Step 1 — Convert

Run pandoc, writing output next to the source:

```bash
pandoc -f latex -t markdown "input.tex" -o "input.md"
```

If pandoc is not installed, report the limitation and either use a safe available conversion method or provide the exact install command; do not turn the missing optional tool into a plugin-level hard stop.

### Step 2 — Check for Three Common Problems

Open the `.md` output and inspect:

1. **Lost section structure** — headings (`#`, `##`, …) should match the original `\section{}`, `\subsection{}` hierarchy. If pandoc flattened them, re-add the correct heading levels manually.

2. **Broken math** — look for:
   - `$...$` or `$$...$$` with mismatched delimiters
   - Raw `\frac`, `\sum`, `\alpha` etc. outside math delimiters (pandoc sometimes drops `$` around inline math)
   - Fix by wrapping bare LaTeX commands in `$...$` or repairing delimiter pairing.

3. **Citation format issues** — pandoc may output `[@citekey]` or raw `\cite{}`. Normalize to `[Author, Year]` if the user wanted readable citations, or leave as `@citekey` if they want pandoc-citeproc compatibility. Ask the user which format they prefer.

### Step 3 — Deliver

Write the corrected `.md` file next to the original `.tex`, or to the path the user specified.

## Important Notes

1. **Preserve math**: Keep LaTeX math as `$...$` / `$$...$$` — do not convert to Unicode symbols.
2. **Preserve citations**: Keep references machine-readable unless user requests otherwise.
3. **No structural changes**: Do not reorder sections, add new content, or summarize.
4. **Only conversion**: This skill converts format only — it does not fill a template or restructure content.
