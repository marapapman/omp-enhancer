---
name: grill-with-docs
description: Grilling session that challenges a plan against the existing domain model, sharpens terminology, and can prepare or apply requested CONTEXT.md and ADR updates as decisions crystallize. Use when a user wants to stress-test a plan against project language and documented decisions.
tags: [documentation, planning, review]
---

## Linked resource boundary

This loaded Skill reveals its two output-format resources. Read only the format
needed by the authorized documentation scope through the remaining linked
resource batch, then wait:

- `RESOURCE EXTENSION | source=skill://grill-with-docs | reads=skill://grill-with-docs/CONTEXT-FORMAT.md`
- `RESOURCE EXTENSION | source=skill://grill-with-docs | reads=skill://grill-with-docs/ADR-FORMAT.md`

These resources shape an authorized output; they do not grant a file write or
select another Skill.

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase, explore the codebase instead.

A read-only grilling or planning request does not authorize file mutation. Update documentation only when the current task explicitly requests documentation changes and native filesystem permission allows them. Otherwise propose the exact glossary or ADR text in the response and continue the discussion without writing.

</what-to-do>

<supporting-info>

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Under an authorized documentation-editing task, create files lazily and only when there is approved content to record. If no `CONTEXT.md` exists, create one only after the first term is resolved and the write is requested. If no `docs/adr/` exists, create it only for a requested ADR.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Prepare or update CONTEXT.md

When a term is resolved, prepare the exact `CONTEXT.md` entry immediately. Apply it at that point only when documentation changes are in the current task and native permission allows the write; otherwise keep the proposal in the response. Use the format in `skill://grill-with-docs/CONTEXT-FORMAT.md`.

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. When all three hold, offer or draft it; write it only under the documentation authority above. Use the format in `skill://grill-with-docs/ADR-FORMAT.md`.

</supporting-info>
