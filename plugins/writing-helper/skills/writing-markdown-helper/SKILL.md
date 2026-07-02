---
name: writing-markdown-helper
description: "Fine-mode paragraph writing — one paragraph at a time with user confirmation at each step"
---

# Writing Markdown Helper Skill

Write academic-style markdown documents one paragraph at a time. The writer agent drafts directly — no subagents. Every paragraph requires user confirmation before the next step. Designed for structured research papers with section metadata in HTML comments.

## When to Use

- User wants to draft a structured markdown document paragraph by paragraph
- User wants systematic, line-by-line composition with review at each step

## Document Structure Assumed

- `##` through `#####`: Section headings — never modify
- `######`: Paragraph nodes. Title = topic sentence (≤50 chars). Body = supporting text (≤500 chars)
- HTML comments `<!-- description: ... -->`: Metadata describing what each section should cover

## Input Files

| File | Purpose |
|------|---------|
| `paper.md` | Primary document; scan for empty sections, read for context |
| `storyline.md` | Research narrative, insights, method — read before drafting |
| `.pi/research/literature.md` | Literature summaries; read to find which paper summaries apply to the current section |
| `.pi/research/papers/` | Downloaded papers — read only the ones relevant to the current section |
| `.pi/research/storyline.md` | Alternative storyline path (if `storyline.md` absent) |

## Fine-Mode Writing Workflow

### Step 1: Generate Overall Outline

1. Read `storyline.md` and the existing `paper.md` structure (Level 2–5 headers + their `description` metadata).
2. Propose a **list of topic sentences** (≤50 chars each) for every empty Level 5 section. Group them under their parent headers.
3. Present the outline to the user. Ask: *"Here is the proposed paragraph outline. Accept, Modify, or Regenerate?"*
4. **Wait for user response.** Do not proceed without confirmation.

### Step 2: Scan & Propose Paragraph

1. Read `paper.md` top to bottom. Find the **first Level 5 section** that has no Level 6 children yet.
2. Report the section name and its `description` metadata. Ask: *"Next section: [title]. Shall I draft a paragraph here based on the approved outline?"*
3. **Wait for user confirmation.**

### Step 3: Gather Context & Draft

Read these files for context:
- `storyline.md` — core narrative and insights
- `.pi/research/literature.md` — identify relevant paper summaries
- Those `.pi/research/papers/` files — literature details for citations
- Any experiment data files if applicable
- The current `paper.md` to avoid redundancy

Then write **exactly one paragraph** (`######` node):
- **Title**: topic sentence from the approved outline (≤50 chars)
- **Body**: supporting text (≤500 chars), with citations where appropriate
- Do not modify any Level 2–5 headers
- Use plain academic language. Be concise. No filler.
- Present the draft to the user.

### Step 4: User Review

Ask: *"Accept, Modify (provide feedback), or Rewrite completely?"*

**Wait for user response.**

### Step 5: Apply & Loop

- **Accept**: Edit `paper.md` to insert the new `######` node under the target section. Return to Step 2.
- **Modify**: Take the user's feedback, revise the paragraph, and re-present (back to Step 4).
- **Rewrite**: Discard and draft anew (back to Step 3).

**Never auto-advance** to the next paragraph without explicit user confirmation at Steps 1, 2, and 4.

## Anti-Patterns

- Do not write multiple paragraphs in one go
- Do not skip outline generation (Step 1)
- Do not insert content before the user accepts it (Step 4)
- Do not modify section headings (Level 2–5)
