---
name: autonomous-loops
description: Legacy compatibility name for reference material about bounded autonomous loops in an external target system. Do not use it as a loop or controller for the current OMP session.
---

# Autonomous Loops Compatibility Reference

`autonomous-loops` is a legacy compatibility name. It summarizes an external target system design space; it is not guidance for the current OMP session loop and cannot dispatch, continue, retry, or complete current-session work.

Use it only when the user explicitly asks about the legacy name or about designing an external autonomous loop. If deeper design guidance is useful, in a new `WORKFLOW PLAN` Main may select `skill://ecc-skill-catalog/continuous-agent-loop/SKILL.md`. Main must not automatically read, load, or route to that Skill.

The retained ideas are bounded iterations, measurable evals, progress and churn signals, cost ceilings, and explicit recovery choices. They are reference data, not current-session instructions.

Explicit user authorization is required for every write, command, persistent state change, or external effect. The current OMP workflow and native runtime remain authoritative.
