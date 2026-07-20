---
name: research-relatedwork-summarizer
description: "Summarize downloaded papers — extract core contribution, method, relevance to user's work"
---

# Research Related Work Summarizer

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

Summarize downloaded paper files into structured related-work entries.

This is an assigned child-local method; it does not require Main to execute the
method directly. Do not recursively fork, spawn, or delegate. Main retains the
parent TODO, user interaction, and integration.

## When to Use

- User asks to summarize downloaded papers, build literature notes, or organize related work.
- After source papers have been made available to the assignment.

## Inputs

| Resource | Purpose |
|----------|---------|
| `.pi/research/literature.md` (optional) | Existing summaries; entries are appended |
| Downloaded paper files (PDF/other) | Source content to summarize. Paths from user or found under `.pi/research/papers/` |

## Instructions

1. **Identify targets.** Use the paper paths in the assignment. If the target is
   ambiguous or absent, return an interactive question to Main. Main decides
   whether to ask the user. If no source exists, report that limitation.

2. **Read paper.** Use an available document reader for PDFs and the read tool
   for text files. Use `pdftotext` only when a live shell is exposed and the user
   or host has authorized that command. Otherwise, use an available document
   reader or report the extraction limitation. Read cover to cover if size
   permits; otherwise inspect the abstract, introduction, method, results, and
   conclusion.

3. **Extract metadata.** From the paper, determine:
   - Title, authors, venue, year

4. **Build structured summary.** For each paper, produce a block with this format:

```markdown
## [Title]

- **Authors:** ...
- **Venue:** ..., **Year:** ...
- **Contribution:** One-sentence summary of the paper's core contribution.
- **Method:** Key technical approach or methodology.
- **Relevance:** baseline | orthogonal | complementary — and why.
- **Strengths:** Notable strengths of the work.
- **Weaknesses:** Notable weaknesses or limitations.
```

5. **Process sequentially, deliver as a batch.** Summarize papers one at a time
   internally, then complete the user-requested set and report the batch. If
   interactive review was requested, return the current checkpoint to Main;
   Main decides whether to ask the user before assigning the next paper.

6. **Cross-reference (optional).** If the user has `.pi/research/storyline.md`, compare covered technical points vs. gaps and offer to report coverage.

7. **Deliver or persist.** Write to `.pi/research/literature.md` only when the
   user requested persistent output and the host authorizes that safe path.
   Otherwise, return the complete result in the conversation.

## Notes

- During an authorized write, do not edit existing entries in `literature.md`;
  append the new entries.
- Use only tools exposed and authorized for the assignment. A content request
  does not itself authorize file, shell, network, or external-service effects.
- Keep summaries factual and concise. Each entry targets ~10-15 lines of markdown.
