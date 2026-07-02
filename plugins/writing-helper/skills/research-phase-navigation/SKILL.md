---
name: research-phase-navigation
description: "Track and navigate research phases — check current phase, advance to next, skip phases"
---

# Research Phase Navigation

Track and move between research workflow phases by reading/editing `.pi/research/state.md`.

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

1. **Read state**: Read `.pi/research/state.md`. If missing, create it with all phases `[ ]` and set storyline to `[>]`.

2. **Show status**: List phases with their markers. If the user only asked to check, report the current phase and stop.

3. **Advance to next**: Find the `[>]` phase, mark it `[x]`, mark the next phase `[>]`. If already at writing, report it's the final phase.

4. **Go back**: Find the `[>]` phase, mark it `[ ]`, mark the previous phase `[>]`. If already at storyline, report it's the first phase.

5. **Jump to phase**: Map any alias (`latex`→`writing`, `socratic`→`discussion`, `related work`→`literature`, `experiment`→`experiments`, `paper`→`writing`) to a valid name. Set the target to `[>]`, mark all phases before it `[x]`, and all phases after it `[ ]`.

6. **Skip phase**: Mark the current `[>]` phase as `[x]`. Ask for a reason (if not provided) and record it as a comment: `[x] storyline — skipped: <reason>`. Advance the next phase to `[>]`.

7. **Apply changes**: Use `edit` to update `.pi/research/state.md`. After any change, re-read and show the new state.

## Skill Handoff

After a phase change (advance, jump, skip, go-back), load the skill for the new current phase and continue:

| Phase | Skill |
|-------|-------|
| storyline | `skills/research-storyline/SKILL.md` |
| literature | `skills/research-literature/SKILL.md` |
| discussion | `skills/research-socratic/SKILL.md` |
| experiments | `skills/research-experiment/SKILL.md` |
| writing | `skills/writing-checkers/SKILL.md` (review existing drafts) or ask the user what writing support they need |

If the target skill file is missing, report the missing path and ask the user how to proceed.

## Constraints

- Only `[>]`, `[x]`, `[ ]` markers on phase lines. Preserve any comments after `—`.
- Do not add phase names outside the valid list.
- Viewing status is read-only — do not mutate state unless the user asked for a change.
