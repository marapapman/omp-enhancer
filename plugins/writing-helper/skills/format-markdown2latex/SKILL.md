---
name: format-markdown2latex
description: "Convert Markdown paper to LaTeX — handle figures, citations, tables, and math"
---

# Format Markdown → LaTeX

Convert a Markdown document to a compilable `.tex` file using pandoc via bash. Handle figures, citations, tables, math, and Chinese characters.

## Trigger

User says "convert paper.md to LaTeX", "generate .tex from markdown", "export to LaTeX", or similar.

## Process

### 1. Read the Markdown

Read the source `.md` file. Check for:
- **Chinese characters** — if detected, add `-M CJKmainfont` to pandoc flags
- **`$$` math blocks** — pandoc preserves them automatically with `--mathjax` or `--webtex`
- **GFM tables** — pandoc converts these to `tabular` environment
- **`![caption](path)` figures** — pandoc generates `\includegraphics`; verify paths exist
- **Citations `[@key]`** — note the `.bib` file if referenced

### 2. Convert with Pandoc

Run pandoc via bash. Use this template command, adjusting flags per source file:

```bash
# Detect CJK
if grep -Pq '[\x{4e00}-\x{9fff}]' input.md 2>/dev/null; then
  CJKFLAGS="-M CJKmainfont=NotoSerifCJK-SC"
fi

pandoc input.md \
  --from markdown+pipe_tables+grid_tables+tex_math_dollars \
  --to latex \
  --standalone \
  --number-sections \
  $CJKFLAGS \
  -o output.tex
```

If `input.bib` exists next to the `.md`, add `--citeproc` and `--bibliography input.bib`.

### 3. Check for Issues

After conversion, grep the `.tex` file for common problems:

| Issue | Search pattern | Fix |
|-------|----------------|-----|
| Unescaped `_` or `&` outside math | `grep -n '[^\\][_&]' output.tex \| grep -v '\$'` | Escape with `\_`, `\&` |
| Broken image paths | `grep -n 'includegraphics' output.tex` | Verify path; add \graphicspath |
| `\tightlist` undefined | `grep -n 'tightlist' output.tex` | Replace with `\begin{itemize}\setlength{\itemsep}{0pt}` + `\end{itemize}` |
| Missing `\\` in table rows | Check tabular env for unbroken rows | Add `\\` line endings |
| Empty `\section{}` | `grep -n 'section{\|subsection{'` | Fill in section title or add blank text |
| Pandoc's `\def\tightlist` not present | Check preamble | Add `\providecommand{\tightlist}{\setlength{\itemsep}{0pt}\setlength{\parskip}{0pt}}` |

### 4. Fix Issues (with Edit/Write)

Apply fixes:
1. **Unescaped chars**: `sed -i` to add backslashes
2. **Missing tightlist**: `edit` preamble to add `\providecommand{\tightlist}{...}`
3. **Graphics path**: add `\graphicspath{{./}{fig/}{images/}}` after `\usepackage{graphicx}`
4. **CJK fallback**: if no pandoc CJK support, manually add `\usepackage{xeCJK}` to preamble

### 5. Output `.tex`

Save as `{basename}.tex` in the same directory. Report: file path, fix counts, remaining warnings.

## Examples

**User**: "Convert paper.md to LaTeX"
**Action**: Read `paper.md`, detect no CJK, run pandoc, check/fix issues, output `paper.tex`.

**User**: "Export 论文.md to LaTeX with bibliography"
**Action**: Detect Chinese characters, run pandoc with `-M CJKmainfont=...` and `--citeproc --bibliography 论文.bib`, add `\usepackage{xeCJK}` if needed, output `论文.tex`.
