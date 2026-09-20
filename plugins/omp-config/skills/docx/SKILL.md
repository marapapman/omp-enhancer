---
name: docx
description: Create, read, edit, convert, and validate Office documents (.docx, .xlsx, .pptx) with the officecli CLI — structure-preserving edits, rendered preview, and validation in one binary.
---

# Office documents via officecli

When this Skill is part of a `writer` or `zh-writer` assignment, that invocation
(the dedicated language-matched text tool, hosted by its packaged Agent compatibility adapter) remains proposal-only: it runs no command and writes no file, and returns the complete proposed artifact or diff. Main or a separate explicitly capable Main-selected Agent owns authorized effects; that owner performs no prose drafting or revision, which belongs to the text tool alone.
## Text ownership and language

Before any document text is created, revised, translated, or replaced, Main
identifies the target language from the requested content and calls the
`writer` text tool for English; Chinese documents use the `zh-writer` text
tool. Mixed-language content runs one text-tool pass per language slice. The
invoked `writer` or `zh-writer` text tool is the sole author of headings,
paragraphs, table text, cell prose, slide copy, labels, captions, notes, and
other narrative content. Main only forwards context, persists or applies the
complete proposal verbatim, and performs non-text integration. Main must not
draft, rewrite, translate, or polish document text; it only forwards the
writer proposal and performs mechanical non-text integration. `task`,
OfficeCLI, visual/layout agents, and reviewers may inspect or report text
findings but must not draft, rewrite, translate, polish, or invent copy. Text
findings return to the corresponding `writer` or `zh-writer` text tool.
OfficeCLI may only apply an approved writer proposal verbatim and then
validate the artifact; it is not a writing or copy-editing tool. This is an
advisory ownership rule, not a router, lifecycle gate, retry policy, or
completion controller.


Use this when a task involves a Word `.docx`, Excel `.xlsx`, or PowerPoint
`.pptx` file. `officecli` is a single self-contained binary (no Office, no
dependencies). If it is missing, install it first and verify:

```bash
curl -fsSL https://d.officecli.ai/install.sh | bash   # Windows: irm https://d.officecli.ai/install.ps1 | iex
officecli --version
```

## Strategy

1. Identify whether the task is read-only, conversion, creation, or modification. Before any text operation, Main makes the corresponding `writer` or `zh-writer` text-tool call and treats its complete proposal as the only content source.
2. Work at the highest layer that works: DOM ops (`add`/`set`/`get`/`query`/`remove`) before raw XML (`raw`/`raw-set`), applying only exact writer-proposed strings and preserving all other text.
3. When unsure about a property name or value format, run `officecli help <format> <element>` instead of guessing.
4. Quote element paths (`'/body/p[3]'`, `'/slide[1]'`) — brackets are shell globs.
5. Verify after edits: `officecli validate <file>` and `officecli view <file> issues`; for visual work render with `officecli view <file> html -o out.html` or `view screenshot -o page.png` and look at the result.
6. Preserve headings, lists, tables, page structure, and tracked content where relevant.
7. Never overwrite the only source document unless the user explicitly asked for that destructive change.
8. For conversions, keep a clear source-to-output mapping and state any unsupported formatting.
9. Run `officecli close <file>` before handing the file to any non-officecli program.
All OfficeCLI commands that carry text or copy must apply an approved writer
proposal verbatim; Main and `task` may perform only mechanical integration and
non-text edits. If validation or visual review finds a text problem, Main
generates the replacement text with a new `writer` or `zh-writer` text-tool
call and returns to the source document rather than editing the artifact ad
hoc.


## Quick reference
Literal text values in the examples (such as `"Summary"`, `"draft"`, and
`"final"`) stand for exact writer proposals; do not invent or revise them in
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
