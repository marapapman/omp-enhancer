---
name: council
description: Surface structured disagreement for ambiguous decisions, tradeoffs, and go/no-go calls. Use when multiple credible paths remain after relevant facts are gathered and the decision benefits from independent perspectives.
origin: ECC
---

# Council

Use distinct decision lenses to challenge framing and make tradeoffs legible.
Council is not code review, implementation planning, factual verification, or a
vote that decides completion.

## Decision packet

Reduce the decision to:

- the exact question;
- credible options;
- constraints and non-goals;
- success criteria and decision owner;
- compact relevant evidence;
- uncertainty that evidence cannot resolve.

Ask one narrow clarification only when a missing answer would change the option
set. For repository-specific decisions, gather just the relevant local anchors
before assigning a perspective.

## Perspective lenses

Choose only lenses that add material disagreement:

| Lens | Contribution |
| --- | --- |
| Architect | correctness, maintainability, long-term implications |
| Skeptic | premise challenge, simplification, assumption breaking |
| Pragmatist | delivery speed, user impact, operational reality |
| Critic | downside risk, edge cases, failure modes |

These are lenses, not required Agent identities. One assignment may cover a
complete lens, or one independent assignment may cover several lenses when
separation adds no value.

## Delegation

Main records its initial position and main risk before seeing delegated
opinions. It then consults the current dynamic Available Agents, prefers a
matching decision or domain Agent when visible, and otherwise uses native `task`.
Main chooses the lenses, Agent choice, and fork width from ambiguity,
independence, capacity, and cost. Batch only runnable independent perspectives;
keep evidence-gathering dependencies in an earlier wave.

Each assignment receives only the decision packet and its lens, then returns:

1. position;
2. strongest reasons;
3. largest risk;
4. premise challenge or overlooked fact;
5. evidence and uncertainty.

Main owns the question, plan, synthesis, verification, fallback when delegation
is unavailable or unsafe, and final recommendation.

## Synthesis

Present the raw positions before the recommendation. Do not discard a dissent
without explaining why, and say when new evidence changed the initial view.

```markdown
## Council: [decision]

### Perspectives
- **[lens]:** [position, reason, risk]

### Synthesis
- **Agreement:** [shared ground]
- **Strongest dissent:** [material disagreement]
- **Premise check:** [whether the question should change]
- **Recommendation:** [path and rationale]
- **Uncertainty:** [what remains unresolved]
```

The decision owner may accept, adjust, or reject the recommendation. Council
creates no vote threshold, retry, publication authority, or completion gate.

## Persistence

Do not create shadow notes. Persist a decision only when the user authorizes it
or the current workflow already owns that artifact, and record the rationale in
the project's established decision surface.
