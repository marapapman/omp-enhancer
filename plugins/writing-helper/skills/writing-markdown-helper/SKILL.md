---
name: writing-markdown-helper
description: Draft or directly revise English Markdown when edited prose is the requested deliverable. Not for review-only findings, LaTeX targets, or fast multi-section first drafts; paragraph-by-paragraph confirmation is optional only when requested.
---

# Writing Markdown Helper Skill

Draft or revise academic-style markdown within the scope the user authorized. Use one focused pass by default. Paragraph-by-paragraph confirmation is an optional interaction mode only when the user explicitly requests it.

## Executor Boundary

This Skill body is the assigned writer child's bounded local method after Main selects the workflow and Skill. It does not select or dispatch Agents. The writer's local self-check does not replace the independent checker. Main owns the parent TODO, finding disposition, integration, final verification, and user-visible delivery. When no matching writer is available, capacity is unavailable, or a safe complete assignment cannot be formed, Main records the limitation and may use the workflow's safe direct fallback.

This writer child is always proposal-only. Return complete proposed text, using
SEARCH/REPLACE blocks or a unified diff when a bounded patch is clearer. Main
retains permission decisions and actual file changes. Do not create or persist
the Markdown target or auxiliary workflow files.

## When to Use

- User wants to draft or revise an English markdown document
- User explicitly requests paragraph-by-paragraph or line-by-line review

## Default Writer Workflow

For ordinary requests such as "polish the abstract" or "revise this section":

1. Read the exact target text and only the nearby context required for the revision.
   Do not repeat a successful complete read before drafting unless it contains
   an explicit truncation marker or an incomplete requested range.
2. Return the complete proposed revision or a bounded patch to Main.
3. Review meaning, structure, citations, and formatting once.
4. Report material limitations. Do not require a new confirmation merely because this skill was loaded.

Before revising, record semantic anchors: frequency and intensity qualifiers,
modality, scope, negation, comparison and causal direction, numbers and units,
citations and identifiers, and LaTeX math, cross-references, commands, and
structure. Preserve them unless the user or evidence explicitly authorizes a
change. Compare source and result once. Report drift without starting another
rewrite automatically. Compare the complete proposed result with the source once.

An explicit edit request normally calls for at least one concrete,
meaning-preserving improvement when the source contains a correctable defect.
Semantic anchors protect their meaning; they do not freeze all surrounding
wording. If one candidate would alter an anchor, discard that candidate and
look for a safe lexical or structural revision outside the anchors. Return the
source unchanged only when no such improvement exists, and report that limitation
without performing extra verification reads.

Evaluate candidates independently. Before returning a no-op, check at least
one anchor-neutral correction for duplication, grammar, collocation, or
redundant wording. Rejecting one unsafe candidate rejects only that candidate;
for example, one occurrence of an accidentally repeated adjacent word can be
removed when the remaining occurrence preserves the meaning.

Use the fine-mode workflow below only when the user asks for interactive approval at each paragraph or when a genuinely material ambiguity requires a choice.

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

## Optional Fine-Mode Writing Workflow

### Step 1: Generate Overall Outline

1. Read `storyline.md` and the existing `paper.md` structure (Level 2–5 headers + their `description` metadata).
2. Propose a **list of topic sentences** (≤50 chars each) for every empty Level 5 section. Group them under their parent headers.
3. Present the outline to the user. Ask: *"Here is the proposed paragraph outline. Accept, Modify, or Regenerate?"*
4. In user-requested fine mode, wait for the response before drafting paragraphs.

### Step 2: Scan & Propose Paragraph

1. Read `paper.md` top to bottom. Find the **first Level 5 section** that has no Level 6 children yet.
2. Report the section name and its `description` metadata. Ask: *"Next section: [title]. Shall I draft a paragraph here based on the approved outline?"*
3. In user-requested fine mode, wait for confirmation.

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

In user-requested fine mode, wait for the response.

### Step 5: Handoff & Loop

- **Accept**: Return a bounded insertion patch for the new `######` node to Main. Return to Step 2.
- **Modify**: Take the user's feedback, revise the paragraph, and re-present (back to Step 4).
- **Rewrite**: Discard and draft anew (back to Step 3).

When fine mode was explicitly requested, do not auto-advance to the next paragraph without confirmation at Steps 1, 2, and 4. In the default writer workflow, complete the requested scope in one focused pass.

## Anti-Patterns

- Do not force fine mode onto an ordinary direct-edit request
- In fine mode, do not write multiple paragraphs in one go
- In fine mode, do not skip outline generation (Step 1)
- In fine mode, do not insert content before the user accepts it (Step 4)
- Do not modify section headings (Level 2–5)
