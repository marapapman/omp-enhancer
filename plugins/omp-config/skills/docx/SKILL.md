---
name: docx
description: Create, read, edit, convert, and validate Office documents (.docx, .xlsx, .pptx) with the officecli CLI — structure-preserving edits, rendered preview, and validation in one binary.
---

# Office documents via officecli

Main drafts every prose passage in this Skill's document, then passes it
through the `polisher` tool and inserts the returned text verbatim. `polisher`
is stateless: one passage in, the same passage polished out; it reads no file,
calls no tool, plans nothing, and verifies no fact. Code, structure, layout,
conversion, and validation stay with Main and `task`, are never sent to
`polisher`, and `task` never rewords copy. Review stays advisory:
`writing_quality_check` and `writing_ai_scan` report findings and never route,
block, retry, or decide completion.

## Text ownership and language

Main drafts headings, paragraphs, table text, cell prose, slide copy, labels,
captions, notes, and other narrative content, and passes each passage through
the `polisher` tool; Main then inserts the returned text verbatim and performs
non-text integration. `task`, OfficeCLI, visual/layout agents, and reviewers
may inspect or report text findings but must not draft, rewrite, translate,
polish, or invent copy. Text findings go back to Main, which drafts the
replacement and passes it through `polisher`.
OfficeCLI may only apply the polished text verbatim and then
validate the artifact; it is not a writing or copy-editing tool. This is an
advisory ownership rule, not a router, lifecycle gate, retry policy, or
completion controller.

For long documents, Main splits the work into polish chunks under the chunk protocol in `skill://omp-enhancer-workflows/references/writing.md`: the communication batch (how much the user discusses at once), the layout batch (how much one task or OfficeCLI pass applies at once), and the polish chunk (how much text Main sends through `polisher` at once) stay distinct, each chunk is drafted by Main, polished by `polisher`, and inserted verbatim (a PPTX chunk is also capped at 6 pages), a section-sized batch never implies that one chunk covers the whole section, and a chunk boundary never forces a user confirmation. Every chunk carries the figure, table, code, and citation rules: figures keep only reading-required annotations, code comments state intent and boundary conditions rather than restating each line, citations are never added, and necessary scope statements, units, qualifiers, existing citations, and safety notes stay.

### Long-document chunk handoff

Under the writing workflow's chunking contract
(`skill://omp-enhancer-workflows/references/writing.md`), Main builds the
chunk list in source order with stable chunk ids and records each chunk's
target file, paragraph/page/shape range, and source version. Main drafts each
chunk and passes it through the `polisher` tool with a frozen style pack and
acceptance checks before inserting the returned text verbatim — never a
resumed session or a whole-document round trip. Main integrates the
polished text in source order into the current complete artifact first and
only then applies it through officecli; structural, layout, and conversion
work stays with Main or `task`. `officecli validate` plus a rendered view
verifies the integrated artifact for uncovered content, missing paragraphs
or pages, truncated objects, unmerged changes, repeated text, and broken
cross-references.


Use this when a task involves a Word `.docx`, Excel `.xlsx`, or PowerPoint
`.pptx` file. `officecli` is a single self-contained binary (no Office, no
dependencies). If it is missing, install it first and verify:

```bash
curl -fsSL https://d.officecli.ai/install.sh | bash   # Windows: irm https://d.officecli.ai/install.ps1 | iex
officecli --version
```

## Strategy

1. Identify whether the task is read-only, conversion, creation, or modification. Before any text operation, Main drafts the text, passes it through the `polisher` tool, and treats the returned text as the only content source.

PPTX-specific standalone editing boundary: when the requested artifact is an already-existing `.pptx`, this Skill runs in PPTX-only mode. The current revision of the requested PPTX is the canonical source. OfficeCLI operates on that existing PPTX directly: it does not require a validated Beamer PDF, does not chase agreement with the upstream Markdown content plan or `.tex`, does not recompile the Beamer deck, and does not reconvert the PPTX from any upstream source. A PPTX edit here never propagates back to the Beamer source or to the Markdown content plan, and a Beamer-side change or storyline-side change never forces an OfficeCLI pass on the PPTX to "fix" alleged disagreement. Conversion from Beamer to PPTX remains in the `beamer-to-powerpoint` / `beamer-pptx-local` Skills; this Skill does not perform that conversion. Word and Excel policies are unchanged by this PPTX-only boundary. Text for such an edit is extracted from the current `.pptx` while keeping its slide and shape anchoring, and neither the Beamer target nor the Markdown content plan is read or overwritten by this path; text that exists only inside an already rendered image is not replaced by OCR guessing, so report that limitation instead.
2. Work at the highest layer that works: DOM ops (`add`/`set`/`get`/`query`/`remove`) before raw XML (`raw`/`raw-set`), applying only exact polished strings and preserving all other text.
3. When unsure about a property name or value format, run `officecli help <format> <element>` instead of guessing.
4. Quote element paths (`'/body/p[3]'`, `'/slide[1]'`) — brackets are shell globs.
5. Verify after edits: `officecli validate <file>` and `officecli view <file> issues`; for visual work render with `officecli view <file> html -o out.html` or `view screenshot -o page.png` and look at the result.
6. Preserve headings, lists, tables, page structure, and tracked content where relevant.
7. Never overwrite the only source document unless the user explicitly asked for that destructive change.
8. For conversions, keep a clear source-to-output mapping and state any unsupported formatting.
9. Run `officecli close <file>` before handing the file to any non-officecli program.
All OfficeCLI commands that carry text or copy must apply the polished text
verbatim; Main and `task` may perform only mechanical integration and
non-text edits. If validation or visual review finds a text problem, Main
drafts the replacement, passes it through `polisher`, and inserts the returned
text before returning to the **requested** source document (the document the user
explicitly asked to edit) rather than editing a different artifact ad
hoc.
For a PPTX edit in PPTX-only mode, "returns to the source document" means
the existing requested `.pptx` itself — never the upstream Markdown content
plan, the Beamer `.tex`, or the Beamer PDF, and the polished text is applied in place on that PPTX only.


## Quick reference
Literal text values in the examples (such as `"Summary"`, `"draft"`, and
`"final"`) stand for exact polished text; do not invent or revise them in
OfficeCLI.


```bash
officecli create report.docx                                            # blank docx/xlsx/pptx (type from extension)
officecli add report.docx /body --type paragraph --prop text="Summary" --prop style=Heading1
officecli view report.docx outline | text | stats | issues | html | screenshot
officecli get report.docx '/body/p[3]' --depth 2 --json                 # structured read
officecli query report.docx 'paragraph[style=Normal] > run[font!=Arial]'
officecli set doc.docx / --find draft --replace final                   # replace (tracked: --prop revision.author=Alice)
officecli remove slides.pptx '/slide[4]'
officecli merge template.docx out.docx --data '{"client":"Acme"}'       # {{key}} template fill
officecli close report.docx                                             # flush resident session to disk
```

Full command surface, element schemas, per-format capabilities, and pitfalls:
`officecli help`, plus the format subskills via `officecli load_skill word |
pptx | excel | academic-paper | pitch-deck | data-dashboard | ...` — load one
skill per artifact, never stack.
