---
name: writing-state-machine
description: Use after Main selects writing for hallucination-sensitive English drafting or revision where citations, numbers, and factual claims require an explicit source-to-text evidence matrix; Main authors the text and passes each drafted passage through the `polisher` tool before delivery. Not for ordinary prose editing. Two isolation modes coexist: the user may explicitly request strict paragraph isolation, and Main may isolate bounded chunks by default under the long-text protocol; never skip a bounded chunk because the user did not request isolation.
---

# Writing State Machine Skill

Use a Read → Draft → Self-check → Handoff matrix for hallucination-sensitive
content. Two isolation modes are available and do not conflict: the user may
explicitly request strict paragraph isolation, and Main may isolate bounded
chunks by default under the long-text protocol. Never skip a bounded chunk
on the grounds that the user did not request isolation.

This skill inherits Main's technical prose baseline and applies it inside the format the user or the target document defines. Its local style list is a supplement; where it conflicts with that baseline, the baseline wins, and an explicit user style still wins.

## Workflow boundary

Use this Skill only after Main selects workflow `writing` and loads its exact workflow reference and this Skill. This is Main's bounded local method for one chunk; nothing here selects or dispatches another agent. Main retains the parent TODO, integration, final verification, and user-visible delivery.

The evidence matrix is Main's local self-check, and the read-only `writing_quality_check` or `writing_logic_check` pass stays separate from it. Run one bounded local pass; it never starts an automatic repair loop or creates a completion gate. Record the paragraph, matrix, provenance, and unresolved gaps in the delivery.

The drafted text reaches the deliverable only as the text `polisher` returned. Draft with the evidence matrix, call `polisher` once per prose segment, and use the returned text verbatim. When a `polisher` call returns `ok:false`, record its error code and report the failure instead of presenting unpolished text as polished output. Do not create or persist target files, research artifacts, or review logs.

## When to Use

- Writing results, experiment sections, or any content with citations and numeric claims
- User explicitly requests "strict mode", "state machine", or "hallucination-free" writing
- Any multi-paragraph document where context drift between paragraphs is unacceptable

## Core Workflow: One Paragraph Per Isolated Cycle

One paragraph per isolated cycle remains the strict evidence method. When the user explicitly requests strict paragraph isolation, process one paragraph independently; strict context isolation happens only on that explicit request. Under the long-text protocol the unit is the authorized chunk rather than the whole document: work only inside that chunk, run the evidence matrix paragraph by paragraph inside it, and close the chunk with its final text before the next chunk begins; this default isolation needs no user request and adds no per-paragraph confirmation. Outside those two isolation modes, use this matrix as quality guidance without forcing a new session per paragraph.

### 1. Read — Only What You Need

Read the specific source data for THIS paragraph. When continuity requires it, also read adjacent paragraphs' transition sentences and terminology; never read unrelated paragraphs. A previous paragraph's claims still never substitute for this paragraph's evidence. Acceptable reads:
- The target document (scan section structure only)
- The specific source document, data table, or reference cited in this paragraph
- The section's metadata/description if available

Use network access only when the user or host authorizes it and a live network capability is exposed. If local evidence is insufficient and either condition is absent, do not browse; record the source gap as a limitation.

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
| An anaphoric passive rider — a complete main clause plus a comma and a with + object + past participle + by + anaphoric actor adjunct — has its action and new object merged into the main clause, the actor named once only when recoverable, never invented | — |
| An anaphoric callback clause — a complete main clause plus a comma and a clause headed by this, that, which, or these whose predicate only labels or stamps what precedes — has a fact-carrying tail folded into the main clause, a labelling-only tail deleted, and no fact or name invented to complete the merged sentence | — |

Fix failed checks that can be resolved from available evidence inside this bounded pass. Report unresolved checks as limitations and continue only within the authorized scope.

### 4. Handoff — Keep the final text

Keep the final text for the unit as the text `polisher` returned, and apply it
when the integration is authorized. The unit is one paragraph in strict
isolation mode and the whole authorized chunk under the long-text protocol.

### 5. Reset — Record where the next step starts

In explicitly requested strict mode, stop after the current paragraph and note
where the next paragraph starts:
> Paragraph complete. The next isolated step continues from [section name].

Under the long-text protocol, work stops at the chunk boundary and records the
chunk id with its final text before the next chunk begins; do not continue into
the next chunk in the same step.

## Scope Guidance

- The unit is the one authorized chunk Main delimited. Main handles each chunk as its own bounded step, stops at the chunk boundary with that chunk's final text, and never merges the next chunk's work into the current one.
- Strict paragraph-by-paragraph context isolation happens only when the user explicitly requests it. Main's default chunk isolation needs no user request and adds no per-paragraph user confirmation.
- The full chunk protocol is the shared chunking contract; it is quoted verbatim once, in the writing-mad-writer Skill's Scope Guidance, and this Skill references that contract here instead of repeating the list.

## Evidence boundary

Never invent placeholder or fake facts, citations, measurements, or numbers. When evidence is insufficient, omit or mark the unsupported claim and record the exact evidence gap as a limitation.

## Anti-Patterns

In explicitly requested strict-isolation mode:

- Process one paragraph per isolated cycle.
- Do not treat a previous paragraph's citation or source as evidence for the current one.
- Omit a claim whose citation tag cannot be verified from the current source.
- Use the self-check matrix once for the current paragraph.
- Start the next cycle with only the context needed for that paragraph.

In every mode, this Skill completes only the bounded drafting method described
above; Main decides whether to apply the result or start another chunk.
