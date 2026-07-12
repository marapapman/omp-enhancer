---
name: writing-state-machine
description: "Strict writing evidence matrix, with paragraph context isolation only when the user explicitly requests it"
---

# Writing State Machine Skill

Use a Read → Write → Self-check → Save matrix for hallucination-sensitive
content. Fresh isolated sessions are an optional mode only when the user
explicitly requests paragraph context isolation.

## When to Use

- Writing results, experiment sections, or any content with citations and numeric claims
- User explicitly requests "strict mode", "state machine", or "hallucination-free" writing
- Any multi-paragraph document where context drift between paragraphs is unacceptable

## Core Workflow: One Paragraph Per Isolated Cycle

When the user explicitly requests strict paragraph isolation, process one paragraph independently. Otherwise use this matrix as quality guidance without forcing a new session per paragraph.

### 1. Read — Only What You Need

Read the specific source data for THIS paragraph only. Do not read anything for other paragraphs. Acceptable reads:
- The target document (scan section structure only)
- The specific source document, data table, or reference cited in this paragraph
- The section's metadata/description if available

### 2. Write — Exactly One Paragraph

Output exactly one paragraph with this structure:

```markdown
###### Title — topic sentence (≤50 chars)

Body text (≤500 chars) with correct `[@citation]` markers.
```

Constraints:
- **Title** ≤50 characters — the topic sentence, not a heading label
- **Body** ≤500 characters — supporting text with inline citations
- **Citations** must be exact — copy from source, do not paraphrase reference tags
- **Metadata** — record source provenance in `.pi/research/review_log.md`, not as HTML comments in the document

### 3. Self-Check — Recommended Verification Matrix

| Check | Pass/Fail |
|-------|-----------|
| Title ≤50 chars | — |
| Body ≤500 chars | — |
| Every citation `[@...]` in body appears in the source | — |
| Source recorded in `.pi/research/review_log.md` with real path | — |
| No claims beyond what source data supports | — |

Fix failed checks that can be resolved from available evidence. Report unresolved checks as limitations and continue only within the user's requested scope.

### 4. Save — Insert Into Document

Use a precise edit to insert the new paragraph under the correct section heading.

### 5. Reset — Destroy All Context

In explicitly requested strict mode, offer this handoff before the next paragraph:
> ✅ Paragraph inserted. To continue, ask the user to say "Continue writing from [section name]."

## Anti-Patterns

In explicitly requested strict-isolation mode:

- Process one paragraph per isolated cycle.
- Do not treat a previous paragraph's citation or source as evidence for the current one.
- Omit a claim whose citation tag cannot be verified from the current source.
- Use the self-check matrix once for the current paragraph.
- Start the next cycle with only the context needed for that paragraph.
