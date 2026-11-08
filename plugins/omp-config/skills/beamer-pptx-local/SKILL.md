---
name: beamer-pptx-local
description: Convert a compiled Beamer PDF into an editable local .pptx (conversion-only branch) without external services — LibreOffice pdfimport pipeline with built-in QA gates (page count parity, no full-slide images) and an optional python-pptx line-merged text layer rebuild from a beamer2pptx extraction manifest. This Skill runs the conversion path only; an edit to an already-existing `.pptx` is a separate PPTX-only task that uses the `docx` Skill with OfficeCLI on the existing PPTX and does not require reconversion, recompilation, or a Beamer source recompute. The conversion preconditions here do NOT apply to standalone PPTX edits, and a PPTX edit never propagates back to the Beamer source or to the Markdown content plan.
---

# Beamer PPTX Local

Main drafts every prose passage in this Skill's deliverable, then passes it
through the `polisher` tool and inserts the returned text verbatim. `polisher`
is stateless: one passage in, the same passage polished out; it reads no file,
calls no tool, plans nothing, and verifies no fact. Code, formulas, citations,
structure, layout, conversion, and validation stay with Main and `task`, are
never sent to `polisher`, and `task` never rewords copy. Review stays advisory:
`writing_quality_check` and `writing_ai_scan` report findings and never route,
block, retry, or decide completion.

Local, dependency-light conversion of compiled Beamer decks into editable
PowerPoint files. Text and layout become editable objects; formulas stay as
editable text fragments (not native Office Math). Use this skill when the
fixed external `beamer2pptx` runtime (`@oai/artifact-tool`) is unavailable or
when a fast local conversion is the goal. It is a fallback pipeline, not a
replacement for the external skill's native-equation quality when that runtime
is available.

## Ownership boundary

This skill performs mechanical conversion only. It never drafts, rewrites, or
polishes slide content. Any text change is drafted by Main, passed through the
`polisher` tool, and inserted verbatim where the finding was found; a content
or layout finding is resolved in place at the stage where it is found and is
not propagated back to the Markdown content plan.

## Pipeline

1. Compile (optional): `xelatex -interaction=nonstopmode deck.tex` (two passes).
2. Convert: the script runs
   `soffice --headless --infilter=impress_pdf_import --convert-to pptx`.
   The `--infilter` is mandatory — without it LibreOffice may fail or paste
   whole pages as images.
3. QA gates (built in): slide count must equal the PDF page count, and no
   slide may contain a picture covering ≥ 98% of the canvas. Violations exit
   non-zero with a JSON report.

## Usage

```bash
# compiled PDF → PPTX
python3.8 <skill_root>/scripts/beamer2pptx_local.py deck.pdf -o deck.pptx

# .tex source → compile with xelatex, then convert
python3.8 <skill_root>/scripts/beamer2pptx_local.py deck.tex -o deck.pptx --xelatex

# optional: rebuild the text layer as merged line boxes from a beamer2pptx
# extraction manifest (formulas merged per line, baseline shifts preserved)
python3.8 <skill_root>/scripts/beamer2pptx_local.py deck.pdf -o deck.pptx \
    --manifest prepared/editable-manifest.json --report qa.json
```

The manifest mode needs `build_pptx_py.py` (bundled next to the main script)
and a manifest produced by the external beamer2pptx skill's
`extract_editable.py`.

## Dependencies

- Python 3.8+ with `PyMuPDF`, `python-pptx` (QA and manifest mode)
- LibreOffice (`soffice`) on PATH
- `xelatex` or `pdflatex` for `.tex` input (with `TEXINPUTS` and `cwd` set to
  the TeX source directory, so `\includegraphics`/`\input` with relative
  paths resolve)

Use this Skill only for the conversion path. PPTX-only edits (changes to any already-existing `.pptx`) use the `docx` Skill with OfficeCLI on the existing PPTX; they do not require reconversion and do not invoke this conversion pipeline.

## Known limitations

- Formulas are editable text runs with baseline shift for sub/superscripts;
  stacked limits (∫ upper/lower bounds) cannot be represented in plain text.
  Native-equation output requires the external `beamer2pptx` runtime plus
  OMML injection (`inject_omml.py` + Pandoc).
- Formula-dense pages can explode into thousands of shapes after LibreOffice
  import — this is expected and does not prevent editing.
- The output is a locally validated draft; it has not been opened in
  Microsoft PowerPoint. Label it as such when delivering; do not claim
  PowerPoint-compatibility evidence that was not produced.
- LibreOffice, Pandoc, or other converters must not silently replace the
  fixed external skill when that skill's runtime is available; use this
  pipeline only when the runtime is genuinely missing or the user opts for
  the local path.
