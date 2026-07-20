READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `database.review` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `database.review`

- Primary when: A read-only review of database schema, SQL, indexes, transactions, locks, permissions, or a migration plan.
- Reference steps:
  1. [step-1] Identify the database engine and version, schema and migration revision, workload assumptions, data scale, deployment state, and review scope.
  2. [step-2] Inspect concrete queries, schema, indexes, constraints, transaction boundaries, locks, permissions, pooling, and migration order without editing or applying them.
  3. [step-3] Validate material findings against plans, tests, documentation, or current non-production evidence when those checks are authorized and safe.
  4. [step-4] Report prioritized findings with exact SQL or migration evidence, trigger, impact, engine assumptions, remediation, and verification.
- Agent candidates: `task`.
- Delegated checkpoints:
  - steps-2-4: task owns a bounded read-only database audit slice and returns concrete artifact and evidence findings without editing, mutating, or applying changes; the parent reconciles scope and conclusions
- Quality checks:
  - engine and version correspondence, query and schema evidence, migration-order consistency, lock and transaction impact, security boundary review, severity rationale, and explicit runtime limitations
- Scope notes:
  - Main owns the bounded review scope and final reconciliation; task may own a complete read-only audit slice, while the native reviewer remains reserved for an existing semantic diff or patch.
  - Confirm the database engine first, then select only the matching engine-specific Skill: postgres-patterns for PostgreSQL or mysql-patterns for MySQL or MariaDB; do not load both by default.
  - Do not run mutating SQL or production EXPLAIN ANALYZE as part of a read-only review.
- Risk notes:
  - Database diagnostics can expose sensitive data or acquire locks; prefer static plans and safe non-production evidence.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.