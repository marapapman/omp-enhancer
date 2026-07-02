---
name: research-literature
description: Literature search and analysis — find related papers, summarize contributions, build cross-index of papers×concepts
---

# Research Literature

## Purpose

Find and analyze academic papers related to the current project. Produces a structured literature survey with per-paper summaries and a cross-index table mapping papers to technical concepts.

## Workflow

### 1. Extract Keywords

Read `.pi/research/storyline.md`; extract 3–8 search keywords. Prefer specific technical terms (e.g. "neural radiance fields" over "computer vision"). If no storyline exists, ask the user for their research topic.

### 2. Search for Papers

```
web_search_exa(query="<keyword> site:arxiv.org", max_results=5)
```

One query per keyword pair. Supplement with direct arXiv ID searches if the user has known seed papers.

### 3. Fetch Abstracts

For each arXiv result, `web_fetch_exa("https://arxiv.org/abs/<id>")`. Extract: title, authors, year, venue, abstract.

### 4. Extract Per-Paper Metadata

For each paper assemble: **Title** | **Authors** | **Year** | **Venue** | **Core contribution** (1 sentence) | **Technical approach** (key method) | **Relevance** (relation to user's work).

Never fabricate. If fetch fails or returns insufficient data, skip the paper.

### 5. Build Cross-Index Table

Identify 3–6 technical concepts that appear across multiple papers. Build a GFM table with ✓/✗/shorthand and brief notes:

```
## Cross-Index

| Paper | Contrastive Pretraining | Vision Transformer | Multi-modal Fusion |
|---|---|---|---|
| CLIP (Radford 2021) | ✓ core method | ✓ encoder | ✓ text+image |
| ALIGN (Jia 2021) | ✓ core method | ✓ encoder | ✓ noisy pairs |
| LiT (Zhai 2022) | ✓ fine-tuning | ✓ frozen | ✗ text-only |
```

### 6. Write Output

Append to `.pi/research/literature.md`. Structure:

```markdown
# Literature Survey: [Project Topic]
_Search date: YYYY-MM-DD_

## Paper: [Full Title]
- **Authors:** [names]
- **Year:** [year], **Venue:** [venue]
- **Core contribution:** [one sentence]
- **Technical approach:** [key method or architecture]
- **Relevance:** [how this relates to your work]
```

Add new papers above existing ones (newest-first). Regenerate the cross-index table to include all papers.

## Rules

1. **Max 10 papers per session.** Keeps the survey focused.
2. **Update incrementally.** Re-read `.pi/research/literature.md` and append/update rather than overwrite.
3. **Never fabricate.** Skip the paper if search or fetch fails.
4. **One concept per column.** Each cross-index column = one well-defined technique/paradigm.
5. **Cite relevance concretely.** "Direct baseline" or "Same dataset" beats "Related approach."

## Pi Integration

- **Trigger:** `/skill:research-literature`
- **Tools:** `web_search_exa` (find papers), `web_fetch_exa` (retrieve abstracts), `research_paper_search` (academic paper search)
- **Input:** `.pi/research/storyline.md` (optional — provides keywords)
- **Output:** `.pi/research/literature.md` (append-only, incremental)
- **No external CLI.** No `.pi/research/state.md`.

## Example Session

```
User: /skill:research-literature
Agent:
1. Read .pi/research/storyline.md → keywords: ["zero-shot classification", "vision-language models"]
2. web_search_exa("zero-shot vision-language models site:arxiv.org") → 5 results
3. web_fetch_exa("https://arxiv.org/abs/2103.00020") → CLIP paper
4. Assemble metadata for 3 papers
5. Build cross-index: Contrastive Pretraining | Text Encoder | Image Encoder
6. Write to .pi/research/literature.md
```
