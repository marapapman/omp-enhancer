READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `factcheck.document` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `factcheck.document`

- Primary when: A claim-by-claim verdict is requested for existing statements, citations, freshness, or support; add research.web only when live evidence collection is also requested.
- Reference steps:
  1. [step-1] Extract checkable claims.
  2. [step-2] Collect one bounded evidence lane for a focused check; add an independent second lane only for a broad task, a high-risk claim, or explicit cross-checking.
  3. [step-3] Cross-check conflicts and dates.
  4. [step-4] Report support, contradiction, staleness, or insufficiency.
  5. [step-5] Revise only when authorized.
- Agent candidates: `fact-planner`, `fact-researcher-a`, `fact-researcher-b`, `fact-cross-checker`, `fact-reviewer`.
- Delegated checkpoints:
  - step-1: fact-planner decomposes the document into checkable claims and defines the evidence plan
  - step-2: fact-researcher-a owns the first bounded evidence lane; fact-researcher-b owns an independent second lane only for a broad task, a high-risk claim, or explicit cross-checking, without copying conclusions
  - step-3: fact-cross-checker classifies agreement, conflicts, dates, and evidence gaps without inventing resolution
  - step-4: fact-reviewer independently audits the final claim-to-evidence mapping and wording before the parent reports
- Quality checks:
  - claim-to-evidence correspondence, source quality, temporal validity, and clear uncertainty
- Scope notes:
  - Unverified memory is not equivalent to sourced evidence.
  - Focused work normally uses one evidence lane; a second lane is reserved for a broad task, a high-risk claim, or explicit cross-checking, and Main chooses the actual Agent and fork width from current native conditions.
- Risk notes:
  - none

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.