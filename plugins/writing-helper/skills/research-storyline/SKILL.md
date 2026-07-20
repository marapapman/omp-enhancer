---
name: research-storyline
description: Interactive storyline construction — guides assigned problem→importance→insight→design→evaluation checkpoints and returns or, when authorized, persists each section
---

# Research Storyline Skill

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

## Purpose

Help build a complete research storyline following the 20-section framework.
This is an assigned child-local method; it does not require Main to execute the
method directly. The assigned child does not own orchestration: do not
recursively fork, spawn, or delegate. Main retains the parent TODO, user
interaction, and integration. The child never invents content and only polishes
what the user provided.

## Workflow

1. **Read any supplied storyline**: If an authorized assignment exposes
   `.pi/research/storyline.md`, read it to find the last completed section.
2. **Handle one section at a time**: Identify the next section and its key
   question. If its answer is absent, formulate 1–2 targeted questions.
3. **Return interaction to Main**: Return any interactive question to Main and
   stop. Main decides whether to ask the user and may later assign the answer as
   a new bounded checkpoint.
4. **Polish supplied answers**: Format the user's supplied answer as bullet
   points under `## Section Name`, without adding facts, claims, or numbers.
5. **Deliver or persist**: Write to `.pi/research/storyline.md` only when the
   user requested persistent output and the host authorizes that safe path.
   Otherwise, return the complete result in the conversation.

## The 20 Sections

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

Return each section in this form; use the same form in
`.pi/research/storyline.md` when persistence is authorized:

```markdown
## Section Name

- User's answer point 1
- User's answer point 2
- (Agent may rephrase for clarity, but never add new content)
```

Separate sections with a blank line. An authorized persistent artifact
accumulates supplied sections as the user progresses through Main.

## Rules

- **One section at a time.** Complete the current section before prompting for the next.
- **Wait through Main.** Do not auto-advance or generate content without a supplied response.
- **Never invent.** Rephrase for clarity and polish, but do not add facts, claims, or numbers the user did not provide.
- **Honor effect authority.** Content-revision permission alone does not authorize a file write.

## Pi Compatibility

Use only tools exposed for the assignment. Do not read or edit
`.pi/research/state.md`, and never write outside an explicitly authorized safe
path. This body is already loaded for the assignment; do not read
`research-storyline` again.
