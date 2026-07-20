---
name: writing-state-machine
description: Use after Main selects writing.en and assigns a writer child for hallucination-sensitive English drafting or revision where citations, numbers, and factual claims require an explicit source-to-text evidence matrix. Not for ordinary prose editing; isolate paragraph context only when explicitly requested.
---

# Writing State Machine Skill

Use a Read → Draft → Self-check → Handoff matrix for hallucination-sensitive
content. Fresh isolated sessions are an optional mode only when the user
explicitly requests paragraph context isolation.

## Workflow boundary

Use this Skill only after Main selects workflow `writing.en`, loads its exact workflow reference and this Skill, and dispatches a `writer` child. This is the assigned writer child's bounded local method. It does not select or dispatch Agents. Do not recursively fork, spawn, or delegate. Main retains the parent TODO, integration, final verification, and user-visible delivery.

The evidence matrix is a writer-local self-check. It does not satisfy or replace an independent `checker` delivery selected by Main. Run one bounded local pass; it never starts an automatic repair loop or creates a completion gate. Return the paragraph, matrix, provenance, and unresolved gaps to Main.

This writer child is proposal-only. Return the complete proposed text, using
SEARCH/REPLACE blocks or a unified diff when a bounded patch is clearer. Main
retains permission decisions and actual file changes. Do not create or persist
target files, research artifacts, or review logs.

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

Use network access only when the user or host authorizes it and a live network capability is exposed. If local evidence is insufficient and either condition is absent, do not browse; return the source gap to Main.

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
- **Metadata** — attach source provenance and any proposed review-log entry to the delivery, never as HTML comments in the document

### 3. Self-Check — Recommended Verification Matrix

| Check | Pass/Fail |
|-------|-----------|
| Title ≤50 chars | — |
| Body ≤500 chars | — |
| Every citation `[@...]` in body appears in the source | — |
| Source provenance includes a real path in the delivery or an authorized review log | — |
| No claims beyond what source data supports | — |

Fix failed checks that can be resolved from available evidence inside this bounded writer pass. Report unresolved checks as limitations and continue only within the assigned scope.

### 4. Handoff — Preserve effect authority

Return the complete paragraph proposal and any bounded insertion patch to Main.
Main decides whether an authorized integration persists either one.

### 5. Reset — Return an isolation handoff

In explicitly requested strict mode, stop after the current paragraph and return this handoff to Main:
> Paragraph complete. A later isolated assignment may continue from [section name].

## Evidence boundary

Never invent placeholder or fake facts, citations, measurements, or numbers. When evidence is insufficient, omit or mark the unsupported claim and return the exact evidence gap to Main.

## Anti-Patterns

In explicitly requested strict-isolation mode:

- Process one paragraph per isolated cycle.
- Do not treat a previous paragraph's citation or source as evidence for the current one.
- Omit a claim whose citation tag cannot be verified from the current source.
- Use the self-check matrix once for the current paragraph.
- Start the next cycle with only the context needed for that paragraph.

In every mode, this Skill completes only the assigned writer-local method. Main decides whether to integrate it, request an independent checker delivery, or start another assignment.
