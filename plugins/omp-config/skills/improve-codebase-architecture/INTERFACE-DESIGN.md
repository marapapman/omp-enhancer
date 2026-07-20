# Interface Design

When the user wants to explore alternative interfaces for a chosen deepening candidate, use a bounded design-and-review pattern. Based on "Design It Twice" (Ousterhout), the first idea is unlikely to be the best, but multiple phase-specific subagents are unnecessary.

Uses the vocabulary in [LANGUAGE.md](skill://improve-codebase-architecture/LANGUAGE.md) — **module**, **interface**, **seam**, **adapter**, **leverage**.

## Process

### 1. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would rely on, and which category they fall into (see [DEEPENING.md](skill://improve-codebase-architecture/DEEPENING.md))
- A rough illustrative code sketch to ground the constraints — not a proposal, just a way to make the constraints concrete

Show this to the user, then immediately proceed to Step 2.

### 2. Draft alternatives and review the plan

Main drafts two or three **radically different** interfaces from the same local evidence. When the `plan` Agent is exposed, give it the complete constraints, evidence anchors, and candidate set for one independent `PLAN REVIEW`; ask it to find missing constraints, shallow seams, and false trade-offs rather than to start another implementation workflow.

Use these different design constraints:

- Agent 1: "Minimize the interface — aim for 1–3 entry points max. Maximise leverage per entry point."
- Agent 2: "Maximise flexibility — support many use cases and extension."
- Agent 3: "Optimise for the most common caller — make the default case trivial."
- Agent 4 (if applicable): "Design around ports & adapters for cross-seam dependencies."

Use both [LANGUAGE.md](skill://improve-codebase-architecture/LANGUAGE.md) vocabulary and CONTEXT.md vocabulary so every candidate names things consistently with the architecture language and the project's domain language.

Each candidate includes:

1. Interface (types, methods, params — plus invariants, ordering, error modes)
2. Usage example showing how callers use it
3. What the implementation hides behind the seam
4. Dependency strategy and adapters (see [DEEPENING.md](skill://improve-codebase-architecture/DEEPENING.md))
5. Trade-offs — where leverage is high, where it's thin

### 3. Present and compare

Present designs sequentially so the user can absorb each one, then compare them in prose. Contrast by **depth** (leverage at the interface), **locality** (where change concentrates), and **seam placement**.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not a menu.
