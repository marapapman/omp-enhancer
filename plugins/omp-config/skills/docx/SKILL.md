---
name: docx
description: Create, read, edit, convert, and validate Office documents (.docx, .xlsx, .pptx) with the officecli CLI — structure-preserving edits, rendered preview, and validation in one binary.
---

# Office documents via officecli

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Use this when a task involves a Word `.docx`, Excel `.xlsx`, or PowerPoint
`.pptx` file. `officecli` is a single self-contained binary (no Office, no
dependencies). If it is missing, install it first and verify:

```bash
curl -fsSL https://d.officecli.ai/install.sh | bash   # Windows: irm https://d.officecli.ai/install.ps1 | iex
officecli --version
```

## Strategy

1. Identify whether the task is read-only, conversion, creation, or modification.
2. Work at the highest layer that works: DOM ops (`add`/`set`/`get`/`query`/`remove`) before raw XML (`raw`/`raw-set`).
3. When unsure about a property name or value format, run `officecli help <format> <element>` instead of guessing.
4. Quote element paths (`'/body/p[3]'`, `'/slide[1]'`) — brackets are shell globs.
5. Verify after edits: `officecli validate <file>` and `officecli view <file> issues`; for visual work render with `officecli view <file> html -o out.html` or `view screenshot -o page.png` and look at the result.
6. Preserve headings, lists, tables, page structure, and tracked content where relevant.
7. Never overwrite the only source document unless the user explicitly asked for that destructive change.
8. For conversions, keep a clear source-to-output mapping and state any unsupported formatting.
9. Run `officecli close <file>` before handing the file to any non-officecli program.

## Quick reference

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
