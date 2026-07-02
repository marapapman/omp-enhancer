---
name: research-socratic
description: Socratic discussion engine — 5-layer questioning (clarify→assume→evidence→alternative→implication) for stress-testing research claims
---

# Research Socratic Discussion

A structured questioning engine for stress-testing research claims through a systematic 5-layer Socratic method. Designed for the main agent to probe claims when the user wants to surface hidden assumptions, blind spots, and weak evidence.

## Usage

The main agent invokes this skill via:

> `/skill:research-socratic`

When the user makes a claim or asks to "probe this claim", "stress-test this", "play socratic", "challenge this", or similar.

## The 5 Layers

Each layer asks one or two targeted questions. Ask them in order. Do not skip layers. Do not reorder.

### Layer 1 — Clarification
*"Define this term precisely. What are its boundaries?"*

- "What exactly does X mean in this context?"
- "Where does the scope of this claim begin and end?"
- "Is there any ambiguity in how you're using this term?"

### Layer 2 — Assumption
*"What implicit assumptions does this depend on?"*

- "What must be true for this claim to hold?"
- "What are you taking for granted here?"
- "If you had to pick the weakest assumption, what would it be?"

### Layer 3 — Evidence
*"What specific evidence supports this? How was it obtained?"*

- "What data or observations support this?"
- "How was the evidence gathered? By whom?"
- "Are there conflicting results you're aware of?"

### Layer 4 — Alternative
*"Is there an alternative explanation? Could the same evidence support a different conclusion?"*

- "What other interpretations could explain the same observations?"
- "If someone disagreed, what would their strongest counter-argument be?"
- "What would need to be true for the opposite conclusion to be correct?"

### Layer 5 — Implication
*"If this assumption is wrong, what breaks?"*

- "What downstream conclusions depend on this?"
- "If this claim is false, what else would need to be revisited?"
- "What's the cost of being wrong about this?"

## Rules

1. **Max 5 rounds per claim (one per layer).** If the claim is not resolved (confirmed, refined, or abandoned) after 5 rounds (one per layer), record it as an open risk.
2. **Max 5 claims per session.** After 5 claims, tell the user you've reached the limit and summarize the open risks.
3. **One question at a time.** Wait for the user's answer before proceeding to the next question.
4. **Stay neutral.** Do not express agreement or disagreement. Only ask questions and record answers.

## Output Format

Append results to `.pi/research/discussion.md`. Create this file if it does not exist. Use the following structure:

```markdown
# Socratic Discussion Log

## Claim: [concise restatement of the claim]

### Round 1 — Clarification
**Q:** Define this term precisely. What are its boundaries?
**A:** [user's answer]

### Round 2 — Assumption
**Q:** What implicit assumptions does this depend on?
**A:** [user's answer]

### Round 3 — Evidence
**Q:** What specific evidence supports this?
**A:** [user's answer]

### Round 4 — Alternative
**Q:** Is there an alternative explanation?
**A:** [user's answer]

### Round 5 — Implication
**Q:** If this assumption is wrong, what breaks?
**A:** [user's answer]

**Status:** resolved | open_risk
```

If fewer than 5 rounds were needed, omit the remaining rounds. Mark status as `resolved` if the user revised or clarified the claim satisfactorily. Mark as `open_risk` if unresolved after 5 rounds or if the user declined to answer.

## Session Summary

At the end of a session (max 5 claims or user says "done"), append:

```markdown
## Session Summary

| # | Claim | Layers Used | Status |
|---|-------|-------------|--------|
| 1 | [abbreviated] | 1–5 | resolved |
| 2 | [abbreviated] | 1–3 | open_risk |

### Open Risks
- Claim 2: [reason it remained unresolved]
```

## Coordination with Other Skills

- For literature retrieval, use `/skill:research-literature` to find supporting/contradicting sources for evidence questions.
- For structured debates, use `/skill:superpowers-brainstorming` to generate counter-arguments.
