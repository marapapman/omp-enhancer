# `database.review` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `database.review`

- Primary when: The user asks for a read-only review of database schema, SQL, indexes, transactions, locks, permissions, or a migration plan.
- Reference steps:
  1. [step-1] Identify the database engine and version, schema and migration revision, workload assumptions, data scale, deployment state, and review scope.
  2. [step-2] Inspect concrete queries, schema, indexes, constraints, transaction boundaries, locks, permissions, pooling, and migration order without editing or applying them.
  3. [step-3] Validate material findings against plans, tests, documentation, or current non-production evidence when those checks are authorized and safe.
  4. [step-4] Report prioritized findings with exact SQL or migration evidence, trigger, impact, engine assumptions, remediation, and verification.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - steps-2-4: the parent directly audits the bounded database artifacts and evidence without editing or applying changes
- Quality checks:
  - engine and version correspondence, query and schema evidence, migration-order consistency, lock and transaction impact, security boundary review, severity rationale, and explicit runtime limitations
- Scope notes:
  - Main owns the bounded target review directly; the native reviewer remains reserved for an existing semantic diff or patch.
  - Do not run mutating SQL or production EXPLAIN ANALYZE as part of a read-only review.
- Risk notes:
  - Database diagnostics can expose sensitive data or acquire locks; prefer static plans and safe non-production evidence.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
