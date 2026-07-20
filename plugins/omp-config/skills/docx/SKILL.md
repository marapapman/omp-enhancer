---
name: docx
description: Create, read, edit, or convert Microsoft Word .docx documents while preserving document structure.
---

# DOCX document handling

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Use this when a task involves a Word document or `.docx` file.

1. Identify whether the task is read-only, conversion, creation, or modification.
2. Preserve headings, lists, tables, page structure, and tracked content where relevant.
3. Never overwrite the only source document unless the user explicitly asked for that destructive change.
4. For conversions, keep a clear source-to-output mapping and state any unsupported formatting.
