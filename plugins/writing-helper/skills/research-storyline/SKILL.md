---
name: research-storyline
description: Interactive storyline construction — guides through problem→importance→insight→design→evaluation, section by section, outputting to .pi/research/storyline.md
---

# Research Storyline Skill

## Purpose

Help the user build a complete research storyline following the 20-section framework. The agent guides section by section, asking 1–2 questions per section, capturing user input, and writing a polished narrative to `.pi/research/storyline.md`. The agent never invents content — it only writes what the user provides.

## Workflow

1. **Check output directory**: Ensure `.pi/research/` exists (create if missing).
2. **Read any existing storyline**: If `.pi/research/storyline.md` exists, read it to resume from the last completed section.
3. **Walk through sections one at a time**: For each section, present the section name, its key question, and ask 1–2 targeted questions. Wait for the user's answer before proceeding.
4. **Write after each section**: Append the user's answer (formatted as bullet points under `## Section Name`) to `.pi/research/storyline.md`.
5. **Always wait for user input** before moving to the next section. Do not auto-generate content or proceed without a response.

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

Each section is written as follows in `.pi/research/storyline.md`:

```markdown
## Section Name

- User's answer point 1
- User's answer point 2
- (Agent may rephrase for clarity, but never add new content)
```

Separate sections with a blank line. The file accumulates each section as the user progresses.

## Rules

- **One section at a time.** Complete the current section before prompting for the next.
- **Wait for the user.** Do not auto-advance or generate content without a response.
- **Never invent.** Rephrase for clarity and polish, but do not add facts, claims, or numbers the user did not provide.
- **Save after each section.** Every answer is written to `.pi/research/storyline.md` immediately.

## Pi Compatibility

This skill uses only `read` and `write` tools — no subagent spawning, no `.pi/research/state.md`, and no file editing outside `.pi/research/`. Load `research-storyline` through the runtime's normal skill mechanism.
