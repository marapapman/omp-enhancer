READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `agentic.simple` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally.

## `agentic.simple`

- Primary when: Only for trivial one-step operations: a simple command execution, a one-line code/text change, a direct factual answer, or a single read-only lookup needing no analysis, investigation, or subagent work.
- Reference steps:
  1. [step-1] Understand the outcome and inspect minimal context.
  2. [step-2] Perform the requested work.
  3. [step-3] Verify proportionally and respond.
- Agent candidates: none suggested.
- Delegated checkpoints:
  - step-1: keep this workflow with the main agent; compose a specialized workflow before delegating any independent checkpoint
- Quality checks:
  - requested outcome, scope, and factual consistency
- Scope notes:
  - No specialized workflow is inferred.
- Risk notes:
  - none

EXECUTION DEFAULT (soft): `direct-simple` — after staged READY, Main works directly and uses no `task` solely because this card was selected.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.