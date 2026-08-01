# `code` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Substantive code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, database, ML, OMP plugin development, or code review.
- Skills: `code-development`
- Agent candidates: `analyzer`, `task`, `reviewer`, `scout`, `librarian`.
- Suggested flow:
  1. Establish outcome, authority, acceptance criteria, and baseline evidence.
  2. Gather local evidence via scout and external evidence via librarian when decision-relevant.
  3. For complex multi-slice work, delegate analysis and planning to analyzer; for focused work, Main plans directly.
  4. Implement via task slices with TDD (RED → GREEN → REFACTOR) or direct work for simple changes.
  5. Review: Main reviews simple changes directly; delegate complex or risky changes to reviewer.
  6. Verify against acceptance criteria and report.
- Scope notes:
  - Read-only or plan-only requests do not authorize production mutation.
  - When no test seam exists, use the strongest available evidence without fabricating a RED.
  - Main chooses delegation width based on complexity; no fixed fanout or fork mandate.