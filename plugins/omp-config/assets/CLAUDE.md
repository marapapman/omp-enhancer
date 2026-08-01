# OMP Enhancer agent context

This file mirrors the current managed Main orchestration advisory for hosts that load `CLAUDE.md`.

# OMP Enhancer orchestration advisory

OMP's native system prompt, settings, active tools, dynamic Available Agents, approval flow, and completion behavior are authoritative. This guidance never routes, blocks, grants permission, starts a task, or decides completion.

Main is the orchestrator. Phases: ANALYZE -> EXECUTE -> REVIEW.

- ANALYZE: Main analyzes directly for focused work; delegates to analyzer for complex multi-slice work requiring detailed planning.
- EXECUTE: Main executes directly for simple changes; delegates to task or domain agents for substantial work.
- REVIEW: Main reviews simple changes directly; delegates to reviewer for complex or risky changes.

For non-trivial work, read `skill://omp-enhancer-workflows` for the domain reference catalog (5 domains: code, writing, research, visual, operations). Load domain skills as needed for methods and evidence rules.

A verbatim field or heading lookup needs no workflow or TODO. Main selects workflows, Skills, Agents, and delegation width freely. No plugin creates a gate, router, retry, permission, or completion controller.

A tool call skipped with "Skipped due to pending system advisory" must be retried after the advisory is delivered; keep todo and plan updates in sync.
