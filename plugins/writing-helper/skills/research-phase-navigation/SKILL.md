---
name: research-phase-navigation
description: "Reference checklist for an already Main-selected research checkpoint — inspect or update authorized phase state without routing Skills or auto-continuing"
---

# Research Phase Navigation

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

Use this reference checklist only after Main has selected and loaded it. It helps
inspect or propose a change to research phase state; it does not select, route,
or automatically continue a workflow or Skill.

## Phase Order

```
storyline → literature → discussion → experiments → writing
```

## State File

`.pi/research/state.md` uses a markdown checklist:

```markdown
# Research Phases

- [>] storyline — Define problem, question, and contribution narrative
- [ ] literature — Search and analyze related papers
- [ ] discussion — Socratic stress-test of claims
- [ ] experiments — Design and plan evaluations
- [ ] writing — Compose and review the paper
```

- `[>]` = current (in progress)
- `[x]` = done (complete)
- `[ ]` = pending (not started)

## Triggers

Use when the user asks about or changes the research phase: "what phase", "current phase", "next phase", "advance", "go back", "skip", "jump to [phase]", "后退", "下一阶段", etc.

## Workflow

1. **Read state**: Read `.pi/research/state.md` when that project path is
   available. If it is missing, use an in-memory default with all phases `[ ]`
   and storyline `[>]`; do not create a file implicitly.

2. **Show status**: List phases with their markers. If the user only asked to check, report the current phase and stop.

3. **Advance to next**: Find the `[>]` phase, mark it `[x]`, mark the next phase `[>]`. If already at writing, report it's the final phase.

4. **Go back**: Find the `[>]` phase, mark it `[ ]`, mark the previous phase `[>]`. If already at storyline, report it's the first phase.

5. **Jump to phase**: Map any alias (`latex`→`writing`, `socratic`→`discussion`, `related work`→`literature`, `experiment`→`experiments`, `paper`→`writing`) to a valid name. Set the target to `[>]`, mark all phases before it `[x]`, and all phases after it `[ ]`.

6. **Skip phase**: Mark the current `[>]` phase as `[x]`. If the reason is not
   provided in an assigned child task, return that interactive question to Main;
   Main decides whether to ask the user. Record a supplied reason as a comment:
   `[x] storyline — skipped: <reason>`. Advance the next phase to `[>]`.

7. **Apply changes**: Compute and show the complete new state. Write to
   `.pi/research/state.md` only when the user requested persistent output and
   the host authorizes that safe path. Otherwise, return the complete result in
   the conversation. After an authorized write, re-read and show the new state.

## Phase-to-Skill Reference

This table is reference data for a later Main-owned decision, not a handoff or
router:

| Phase | Skill |
|-------|-------|
| storyline | `skill://research-storyline` |
| literature | `skill://research-literature` |
| discussion | `skill://research-socratic` |
| experiments | `skill://research-experiment` |
| writing | A currently visible writing Skill matching the requested support |

After reporting a phase change, stop. Main may later create a new `WORKFLOW PLAN`,
choose an exact `skill://research-storyline` URI (or another exact URI from the
currently visible Skill inventory), read it and wait. This Skill never chooses
or reads the next Skill itself. A missing project state path does not mean that
a Skill is unavailable; only the runtime's exact-URI resolver can establish
that finding.

## Constraints

- Only `[>]`, `[x]`, `[ ]` markers on phase lines. Preserve any comments after `—`.
- Do not add phase names outside the valid list.
- Viewing status is read-only — do not mutate state unless the user asked for a change.
