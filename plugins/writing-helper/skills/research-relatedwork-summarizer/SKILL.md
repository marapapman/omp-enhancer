---
name: research-relatedwork-summarizer
description: "Summarize downloaded papers — extract core contribution, method, relevance to user's work"
---

# Research Related Work Summarizer

Summarize downloaded paper files into structured entries, appended to `.pi/research/literature.md`.

## When to Use

- User asks to summarize downloaded papers, build literature notes, or organize related work.
- After papers have been downloaded, for example with the `research-literature` workflow.

## Inputs

| Resource | Purpose |
|----------|---------|
| `.pi/research/literature.md` (optional) | Existing summaries; entries are appended |
| Downloaded paper files (PDF/other) | Source content to summarize. Paths from user or found under `.pi/research/papers/` |

## Instructions

1. **Identify targets.** Ask the user which paper(s) to summarize — a specific one or all found under `.pi/research/papers/`. If none exist, refuse and explain.

2. **Read paper.** For PDF files, use bash: pdftotext to extract text first, then summarize the text. For text files, use the read tool directly. Read cover to cover if size permits; otherwise skim abstract, intro, method, results, conclusion.

3. **Extract metadata.** From the paper, determine:
   - Title, authors, venue, year

4. **Write structured summary.** For each paper, append a block to `.pi/research/literature.md` with this format:

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
   internally, then complete the user-requested set and report the batch. Pause
   after each paper only when the user explicitly requests interactive review.

6. **Cross-reference (optional).** If the user has `.pi/research/storyline.md`, compare covered technical points vs. gaps and offer to report coverage.

## Notes

- Do not edit existing entries in `literature.md` — always append.
- Use direct agent work (read, write, edit tools). No subagent spawning, no CLI, no external services.
- Keep summaries factual and concise. Each entry targets ~10-15 lines of markdown.
