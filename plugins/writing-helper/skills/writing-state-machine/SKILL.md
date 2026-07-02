---
name: writing-state-machine
description: "Strict-mode writing — isolated context per paragraph, each independently verified before proceeding"
---

# Writing State Machine Skill

Strict state-machine writing with full context isolation between paragraphs. Each paragraph is produced in a **fresh, isolated session**: Read source → Write → Self-check → Save → Reset. No context carries to the next paragraph. Best for hallucination-sensitive content where every citation, number, and claim must be independently verifiable.

## When to Use

- Writing results, experiment sections, or any content with citations and numeric claims
- User explicitly requests "strict mode", "state machine", or "hallucination-free" writing
- Any multi-paragraph document where context drift between paragraphs is unacceptable

## Core Workflow: One Paragraph Per Isolated Cycle

For EACH paragraph, process one paragraph independently, then ask the user to continue.

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

### 3. Self-Check — Mandatory Verification Matrix

| Check | Pass/Fail |
|-------|-----------|
| Title ≤50 chars | — |
| Body ≤500 chars | — |
| Every citation `[@...]` in body appears in the source | — |
| Source recorded in `.pi/research/review_log.md` with real path | — |
| No claims beyond what source data supports | — |

If ANY check fails, **rewrite the paragraph**. Do not proceed.

### 4. Save — Insert Into Document

Use a precise edit to insert the new paragraph under the correct section heading.

### 5. Reset — Destroy All Context

**Do not proceed to the next paragraph in this session.** Output:
> ✅ Paragraph inserted. To continue, ask the user to say "Continue writing from [section name]."

## Anti-Patterns

- **Never** write two paragraphs in one session
- **Never** carry a citation or source reference from a previous paragraph
- **Never** guess a citation tag — if you cannot find it in the source, omit the claim
- **Never** skip the self-check matrix
- **Never** reuse context from a prior paragraph's reads
