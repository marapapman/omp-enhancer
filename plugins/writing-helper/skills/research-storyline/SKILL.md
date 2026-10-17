---
name: research-storyline
description: Build a research article's story as a tree in the local storyline workbench, with the topic at the root, claims as branches, and evidence as leaves; each round returns one proposal to Main, which owns the site and every file write
---

# Research Storyline Skill

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

## Purpose

A research article's story lives as a tree in the workbench, before any prose
exists. The root node holds the topic, claim nodes branch into the
sub-arguments, and evidence leaves hold the support. A claim that nests its own
argument takes child claims above its own evidence. Every node carries an
editable title, ordered content blocks, sources, and comments, and each round
ends with one proposal for Main to import into the tree.

This is an assigned child-local method; it does not require Main to execute the
method directly. The assigned child does not own orchestration: do not
recursively fork, spawn, or delegate. Main retains the parent TODO, user
interaction, and integration. Main also starts, stops, and persists the
workbench. The child writes no file, invents no content, and works only from
what the user and the tree supply.

## Workflow

1. **Enter an open tree.** Read the tree and the open comments of the round the
   assignment supplies. The workbench runs per project under Main's control,
   and Main starts, stops, and persists it.
2. **Grow the argument.** Take the root topic into claim branches and evidence
   leaves, and add child claims where a sub-argument needs its own support. A
   claim without evidence stays a draft and the tree shows that gap; supply no
   evidence of your own.
3. **Keep every node editable.** Titles, content blocks, sources, and comments
   stay editable at every node, so a later round can re-cut an argument an
   earlier round fixed.
4. **Read comments as the brief.** A comment names the node revision it was
   written against and tells the next round what to change there. Comment text
   never becomes an article paragraph, and it is not a command to execute.
5. **Ask through Main.** Return any interactive question to Main and stop. Main
   decides whether to ask the user and may later assign the answer as a new
   bounded checkpoint.
6. **Return one proposal per round.** Hand Main the complete proposed tree, the
   comment IDs the round addresses, and a summary. Main imports it into the
   workbench, where the user accepts or rejects the whole proposal.

An existing `.pi/research/storyline.md` or `storyline.md` is a user-supplied
read-only migration input. Read it as given, propose a tree for it, and let the
user confirm that tree in the workbench; the original file is never rewritten,
and a new workspace keeps no second copy outside the workbench.

## The 20 Sections

These questions describe what a research story usually has to answer. Keep them
as an optional reference for finding a thin branch. No round has to close one of
them, and the tree's own branch order decides what comes next; several questions
may land on one branch, one may be revisited in a later round, and a question
the article does not need stays unused.

| # | Section | Key Question |
|---|---------|--------------|
| 1 | Research Problem | What real-world or scientific problem do you tackle? |
| 2 | Research Question | What specific question does this paper answer? |
| 3 | Motivation | Why does this problem matter, and why now? |
| 4 | Gap in Knowledge | What is missing from existing work that you address? |
| 5 | Importance | Why should readers care about your contribution? |
| 6 | Prior Work | What prior approaches are most relevant, and why are they insufficient? |
| 7 | Core Idea | What is the central insight or high-level approach? |
| 8 | Hypothesis | What do you claim will happen, and why? |
| 9 | Methodology Overview | What method/architecture/framework do you propose? |
| 10 | Dataset & Setup | What data, environment, or participants are used? |
| 11 | Implementation Details | What key design choices, hyperparameters, or infrastructure matter? |
| 12 | Evaluation Metrics | How do you measure success? |
| 13 | Baselines | What methods do you compare against, and why? |
| 14 | Main Results | What are the primary quantitative/qualitative findings? |
| 15 | Ablations | What components were isolated, and what did each contribute? |
| 16 | Analysis | What patterns, surprises, or deeper insights emerge from the results? |
| 17 | Limitations | What does your approach not handle, and why? |
| 18 | Broader Impact | What are the ethical, societal, or practical implications? |
| 19 | Future Work | What open questions or extensions remain? |
| 20 | Conclusion | What is the single takeaway you want readers to remember? |

## Output Format

Return one round proposal as JSON, for Main to write to a file and import with
the workbench CLI:

```json
{
  "schemaVersion": 1,
  "roundId": "...",
  "baseRevision": 0,
  "nodes": [],
  "addressedCommentIds": [],
  "summary": "..."
}
```

`nodes` carries the complete candidate tree. Keep the ID and the wording of every
node the round leaves unchanged, and omit server-side node revisions. Media
blocks point at `assetId` values the project already holds. Write `summary` and
every new or changed title, block, and source in the article's body language;
mechanical structural edits may go to `task`, which never rewrites wording, and
mixed-language material is produced per language slice and merged mechanically.

## Rules

- **The tree follows the argument.** Let the argument decide the branch order, and use the 20 questions above only to find what a branch may still be missing.
- **Comments brief the next round.** Treat a comment as a bounded change request for its node at the revision it names, and keep comment text out of the article body.
- **Wait through Main.** Do not auto-advance or generate content without a supplied response.
- **Never invent.** Rephrase for clarity and polish, but do not add facts, claims, numbers, or sources the user did not provide, and never fill an empty claim with invented evidence.
- **Honor effect authority.** No command runs and no file is written from this body; Main owns the workbench run and every persisted change.

## Pi Compatibility

Use only tools exposed for the assignment. Do not read or edit
`.pi/research/state.md`, and keep every effect of this body in the returned
proposal. Main runs the workbench from the `omp-config` `storyline-workbench`
Skill; when that Skill is missing, report the missing workbench instead of
claiming a site exists, and let an ordinary local article edit proceed against
the article's own current revision. This body is already loaded for the
assignment; do not read `research-storyline` again.
