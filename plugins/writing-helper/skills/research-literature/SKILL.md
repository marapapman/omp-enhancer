---
name: research-literature
description: Find and analyze academic literature, summarize source-supported contributions, and build a papers-by-concepts cross-index when a task needs literature research.
---

# Research Literature

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

Build a focused literature survey whose metadata, summaries, and comparisons remain traceable to retrieved sources.

## Workflow

### 1. Establish the topic

Derive the research question and 3–8 specific search terms from the user request and in-scope project material. Read `.pi/research/storyline.md` only when it exists and is relevant; never assume that path is present. Ask for the topic only when the available context is genuinely insufficient.

### 2. Collect sources

Search the network only when the current task requires external research and native network permission allows it. Use the currently available native search and browsing tools rather than assuming a fixed tool name. Prefer primary papers and authoritative publisher or repository pages; use known seed papers when supplied.

For every retained paper, record the source URL or stable identifier and retrieve enough primary text to support the fields being reported. A search snippet alone does not establish authorship, venue, method details, or results.

### 3. Extract evidence

For each paper assemble:

- title, authors, year, and venue, each tied to the retrieved source;
- core contribution and technical approach, clearly separated from your interpretation;
- concrete relevance to the current project;
- limitations or unresolved metadata.

Never fabricate. If a source fails, conflicts, or lacks a field, mark that field unresolved or omit the paper. Do not infer a venue, result, or method detail from a title.

### 4. Cross-index concepts

Identify 3–6 well-defined concepts supported by the source material. Build a GFM table with one concept per column. Distinguish explicit source support from analyst interpretation; use `unknown` instead of guessing.

```markdown
## Cross-Index

| Paper | [Concept A] | [Concept B] | [Concept C] |
|---|---|---|---|
| [Verified paper] | supported | unknown | interpreted: [brief basis] |
```

### 5. Deliver the survey

Return the survey in the response by default. Write only when the current task explicitly requests file output and native filesystem permission allows it. Use the requested safe path; use `.pi/research/literature.md` only when the user requests that path or the current project already establishes it as the intended artifact. Re-read an existing target before an authorized incremental update and preserve unrelated content.

Suggested structure:

```markdown
# Literature Survey: [Project Topic]
_Search date: YYYY-MM-DD_

## Paper: [Verified title]
- **Source:** [stable URL or identifier]
- **Authors:** [source-supported names]
- **Year / venue:** [supported value or unresolved]
- **Core contribution:** [source-supported summary]
- **Technical approach:** [source-supported method]
- **Relevance:** [clearly labeled analysis]
- **Limitations:** [source or evidence gap]
```

## Quality rules

1. Keep the set focused; ten papers is a useful session ceiling, not a completeness claim.
2. Never fabricate citations, metadata, methods, or results.
3. Preserve source-to-claim traceability for every factual field.
4. Use `unknown` for missing evidence and surface contradictory sources.
5. Treat file output and network retrieval as separate effects, each governed by the current task and native permissions.

This body is already loaded for the current method; do not read
`research-literature` again. A separately installed academic search provider is
optional and may be used only when currently available and authorized.
