---
name: format-humanizer
description: "Remove AI writing traces — identify and replace overused AI phrases, flatten overly structured prose"
---

# Format Humanizer

Scan a document for AI-generated writing patterns and apply authorized,
meaning-preserving replacements in one focused pass. Use one-at-a-time
confirmation only when the user explicitly requests interactive review or a
replacement would alter meaning.

## Trigger

Use when the user asks to "humanize", "de-AI", "remove AI traces", "make this sound less AI", "fix the AI writing", or similar. Also when reviewing output that feels formulaic — symmetrical paragraphs, repetitive transitions, padded introductions.

## Patterns to Scan For

| Pattern | What to catch | Example before → after |
|---|---|---|
| **Repetitive transitions** | furthermore, moreover, in addition, consequently, nevertheless, thus, therefore (when overused, especially start of every paragraph) | "Moreover, the model improves accuracy. Furthermore, it reduces latency." → "The model improves accuracy and reduces latency." |
| **Generic hedging** | it is worth noting, it is important to, it should be mentioned, notably, it is interesting to, it is crucial to | "It is worth noting that the experiment succeeded." → "The experiment succeeded." |
| **Symmetrical paragraphs** | Every paragraph starts the same way, same length, same structure. Three-sentence paragraphs where sentence 2 elaborates and sentence 3 transitions. No rhythm variation. | Break the symmetry — merge short adjacent paragraphs, rewrite identical openers, vary sentence length. |
| **Formulaic introductions** | "In today's rapidly evolving [landscape/field/era]", "With the advent of", "In recent years, there has been", "This paper explores/presents/delves into", "The remainder of this paper is organized as follows" | "Transformer models now dominate NLP." (not "In recent years, transformer models have emerged as a pivotal force in the rapidly evolving landscape of natural language processing.") |
| **Inflated significance** | stands as a testament, marks a pivotal moment, plays a crucial role, serves as a, underscores the importance, reflects broader trends, represents a shift | "The 1989 law established the institute." (not "The 1989 law marked a pivotal moment, standing as a testament to..." ) |
| **Superficial -ing clauses** | highlighting/underscoring/emphasizing/reflecting/contributing to/symbolizing/fostering ... (tacked on at end of sentence) | "The temple uses blue and gold, referencing local wildflowers." (not "...symbolizing Texas bluebonnets, reflecting the community's connection to the land.") |
| **Copula avoidance** | serves as/stands as/marks/represents/boasts/features instead of is/are/has | "The gallery has 3,000 square feet." (not "The gallery boasts 3,000 square feet.") |
| **AI vocabulary** | delve, intricate, interplay, tapestry, testament, beacon, pivotal, foster, garner, showcase, underscore, vibrant, rich (figurative), landscape (abstract), embrace | Replace with plain alternatives. "landscape" → "field"/"industry". "delve into" → "examine" or drop. |
| **Rule of three** | Ideas forced into groups of three to sound comprehensive | "keynotes, panels, and networking" → "talks and panels, plus time to network." |
| **Em dash overuse** | More than 1–2 em dashes per page of prose | Replace with commas, periods, or parentheses. |
| **Negative parallelism** | "It's not just about X, it's about Y." "Not only X but also Y." | Rewrite as a plain positive statement. |
| **Announcements & signposting** | "Let's dive in", "Let's explore", "Here's what you need to know", "Without further ado", "In this section, we will" | Just start saying what you need to say. |
| **Generic positive conclusions** | "The future looks bright", "Exciting times lie ahead", "This represents a major step forward" | Replace with a specific forward-looking statement or cut entirely. |

## Process

1. **Scan.** Read the full document. Identify every instance of the patterns above. Collect into a list of findings with exact quotes.

2. **Assess findings.** For each finding, record:
   - Pattern name
   - Original text (with context, ~2 lines around if needed)
   - Suggested replacement
   - Whether it is a safe expression-only replacement or needs an author decision

3. **Apply.** Apply safe replacements within existing edit authorization.
   Present only substantive decisions to the user.

4. **Output comparison.** After all findings are processed, show:
   - **Before** — full original text
   - **After** — full revised text
   - **Changes** — count of replacements by pattern type

## Voice Guidance

Favor shorter sentences, is/are/has over substitutes, specific details over vague claims. Eliminate padding.

## Optional Interactive Output

Use this format only when the user requested issue-by-issue confirmation:

```
--- Finding 1 / N ---
Pattern: [pattern name]
Original: [exact quote with context]
Suggestion: [replacement text]
Replace? (y/n)
```

After all findings:

```
--- Before ---
[original full text]

--- After ---
[revised full text]

--- Changes ---
- repetitive transitions: 3 replaced
- generic hedging: 2 replaced
- inflated significance: 1 replaced
...etc
```
