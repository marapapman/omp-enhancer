READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `writing.pending` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally.

## `writing.pending`

- Primary when: Temporary Primary when a named writing target's body language is unknown; after one narrow language read, replace once with writing.zh or writing.en before substantive work.
- Reference steps:
  1. [step-1] After the initial READY, Main performs exactly one narrow source read of the user-named target for body language only; no substantive review or revision.
  2. [step-2] Emit one replacement `WORKFLOW PLAN` at visible byte 0, replacing `writing.pending` with `writing.zh` or `writing.en` while retaining the same format Add-ons.
  3. [step-3] Load only newly required language Skills and the selected language workflow reference last; do not reread loaded format companions or other loaded resources, then wait and emit replacement `WORKFLOW READY`.
  4. [step-4] Rebase TODO from the selected language workflow and follow its subagent-driven writer and checker sequence.
- Agent candidates: none suggested.
- Delegated checkpoints:
  - step-1: Main agent owns the one narrow language-only read after initial READY and delegates no prose work before replacement READY
  - step-4: after replacement READY, use only the selected writing.zh or writing.en workflow's language-matched subagents
- Quality checks:
  - preserve meaning, anchors, markup, and document structure
- Scope notes:
  - The instruction language is not evidence of the document language.
  - Language-specific skills remain undecided until source text is available.
  - This is the only one-time replacement PLAN transition: it resolves new language evidence and does not create a router, gate, retry, or general permission to repeat PLAN.
  - No substantive review or revision occurs between the initial READY and replacement READY.
  - If the narrow read cannot determine the requested language, ask the user; never repeat the transition or guess.
- Risk notes:
  - none

EXECUTION DEFAULT (soft): `defer-until-composed` — after initial READY, make one narrow language-only read, emit one replacement PLAN for `writing.zh` or `writing.en` with stable companions and only new resources, emit replacement READY, then follow the selected card; never loop or guess.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
PENDING TRANSITION: after initial READY/TODO, make exactly one narrow body-language read with no substantive review. Next visible bytes are WORKFLOW PLAN: replace pending with `writing.zh` or `writing.en`, retain format Add-ons, put only new language Skills in NOW and its Primary reference last in THEN, load/wait, then emit replacement READY and TODO/wait. If ambiguous, ask; never loop or guess.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.