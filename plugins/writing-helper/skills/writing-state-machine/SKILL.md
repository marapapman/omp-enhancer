---
name: writing-state-machine
description: Use after Main selects writing and passes the assignment to a `writer` text-tool call for hallucination-sensitive English drafting or revision where citations, numbers, and factual claims require an explicit source-to-text evidence matrix. Not for ordinary prose editing; isolate paragraph context only when explicitly requested.
---

# Writing State Machine Skill

Use a Read → Draft → Self-check → Handoff matrix for hallucination-sensitive
content. Fresh isolated sessions are an optional mode only when the user
explicitly requests paragraph context isolation.

This skill inherits the writer text tool's built-in technical prose style and applies it inside the format the user or the target document defines. Its local style list is a supplement; where it conflicts with that baseline, the baseline wins, and an explicit user style still wins.

## Workflow boundary

Use this Skill only after Main selects workflow `writing`, loads its exact workflow reference and this Skill, and passes the assignment to a `writer` text-tool call. This is the `writer` text tool's bounded local method. It does not select or dispatch Agents. Do not recursively fork, spawn, or delegate. Main retains the parent TODO, integration, final verification, and user-visible delivery.

The evidence matrix is a writer-local self-check. It does not satisfy or replace an independent `checker` delivery selected by Main. Run one bounded local pass; it never starts an automatic repair loop or creates a completion gate. Return the paragraph, matrix, provenance, and unresolved gaps to Main.

The `writer` text tool is proposal-only. Return the complete proposed text, using
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

Read the specific source data for THIS paragraph. When continuity requires it, also read adjacent paragraphs' transition sentences and terminology; never read unrelated paragraphs. A previous paragraph's claims still never substitute for this paragraph's evidence. Acceptable reads:
- The target document (scan section structure only)
- The specific source document, data table, or reference cited in this paragraph
- The section's metadata/description if available

Use network access only when the user or host authorizes it and a live network capability is exposed. If local evidence is insufficient and either condition is absent, do not browse; return the source gap to Main.

### 2. Write — Natural Paragraphs by Default

Default output is the natural paragraph or paragraphs the assigned content needs, with correct `[@citation]` markers. Use this structure only when the user explicitly asks for the paragraph-node template or the target document uses it:

```markdown
###### Title — topic sentence (≤50 chars)

Body text (≤500 chars) with correct `[@citation]` markers.
```

Constraints:
- **Title** ≤50 characters and **Body** ≤500 characters only when that template is in effect; otherwise paragraph length follows the task and the argument
- **Citations** must be exact — copy from source, do not paraphrase reference tags
- **Metadata** — attach source provenance and any proposed review-log entry to the delivery, never as HTML comments in the document

### 3. Self-Check — Recommended Verification Matrix

| Check | Pass/Fail |
|-------|-----------|
| Title ≤50 chars (only when the node template is in effect) | — |
| Body ≤500 chars (only when the node template is in effect) | — |
| Every citation `[@...]` in body appears in the source | — |
| Source provenance includes a real path in the delivery or an authorized review log | — |
| No claims beyond what source data supports | — |
| Sentence keeps only a new fact, necessary qualifier, or key logical relation; redundant wording deleted first, anchors and citations untouched | — |

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

In every mode, this Skill completes only the assigned `writer` text-tool method. Main decides whether to integrate it, request an independent checker delivery, or start another assignment.
