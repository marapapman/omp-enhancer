# database workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.

## `database.review`

- Use when: The user asks for a read-only review of database schema, SQL, indexes, transactions, locks, permissions, or a migration plan.
- May compose with: `code.review`, `code.test`, `security.review`, `performance.optimize`.
- Reference steps: (1) [step-1] Identify the database engine and version, schema and migration revision, workload assumptions, data scale, deployment state, and review scope. (2) [step-2] Inspect concrete queries, schema, indexes, constraints, transaction boundaries, locks, permissions, pooling, and migration order without editing or applying them. (3) [step-3] Validate material findings against plans, tests, documentation, or current non-production evidence when those checks are authorized and safe. (4) [step-4] Report prioritized findings with exact SQL or migration evidence, trigger, impact, engine assumptions, remediation, and verification.
- Optional skills: `postgres-patterns`, `database-migrations`, `verification-before-completion`.
- Optional Agent candidates: `omp-target-auditor`.
- Optional delegation ideas: steps-2-4: omp-target-auditor independently audits the bounded database artifacts with selected database skills and returns evidence-backed findings without editing or applying changes.
- Quality checks: engine and version correspondence, query and schema evidence, migration-order consistency, lock and transaction impact, security boundary review, severity rationale, and explicit runtime limitations.
- Scope notes: Use omp-target-auditor with database skills for an existing bounded database target; the OMP native reviewer remains reserved for a supplied patch or diff; Do not run mutating SQL or production EXPLAIN ANALYZE as part of a read-only review.
- Risk notes: Database diagnostics can expose sensitive data or acquire locks; prefer static plans and safe non-production evidence.

## `database.change`

- Use when: The user authorizes a schema, query, index, constraint, data-migration, or database-configuration change with verification.
- May compose with: `code.plan`, `code.dev`, `code.test`, `database.review`, `security.review`, `release.publish`.
- Reference steps: (1) [step-1] Confirm the engine and version, current schema and migration state, data scale, compatibility window, target environments, backup evidence, and authorization boundary. (2) [step-2] Plan the smallest forward change, application compatibility sequence, lock and downtime budget, validation, rollback or forward-repair path, and release order. (3) [step-3] Write or update focused migration, query, compatibility, and rollback tests against a disposable or explicitly authorized environment. (4) [step-4] Implement only the planned source and migration changes without applying them to an unapproved live database. (5) [step-5] Verify clean and representative upgrade paths, application compatibility, migration state, data invariants, rollback or forward repair, and exact commands and exit status. (6) [step-6] Independently review the migration and application diff, backup and rollback evidence, lock and data risk, tests, and release boundary.
- Optional skills: `database-migrations`, `postgres-patterns`, `test-driven-development`, `safety-guard`, `verification-before-completion`.
- Optional Agent candidates: `plan`, `implementation-task`, `reviewer`.
- Optional delegation ideas: step-2: plan owns the compatibility, migration, validation, release-order, and rollback plan without editing or applying changes; steps-3-4: implementation-task owns only the authorized migration, application, and focused test changes; step-6: reviewer independently audits the database and application diff, tests, backup, migration state, rollback, and release boundary.
- Quality checks: current migration state, backup evidence, compatibility order, bounded lock and downtime impact, data invariants, clean upgrade tests, rollback or forward-repair evidence, semantic diff review, and exact execution boundary.
- Scope notes: Repository migration changes do not authorize applying them to staging or production; Separate schema expansion, data backfill, application cutover, and contraction when compatibility or scale requires it.
- Risk notes: Schema and data changes can be destructive or irreversible; use the host approval path and never infer authority over a live database.

## `database.migration.repair`

- Use when: A database migration failed, diverged, partially applied, or left environments at inconsistent states and the user wants diagnosis and an authorized repair.
- May compose with: `code.debug`, `code.dev`, `code.test`, `database.review`, `security.review`.
- Reference steps: (1) [step-1] Freeze the target environment boundary and collect the exact migration command, tool and database versions, migration state, failure output, schema state, backup status, and affected data evidence. (2) [step-2] Reproduce or model the failed transition in a disposable environment and distinguish an unapplied, partially applied, divergent, locked, or data-dependent state. (3) [step-3] Plan the smallest safe forward repair or rollback with prerequisites, invariant checks, idempotency, application compatibility, and a stop condition. (4) [step-4] Add a regression that represents the failed migration state, then implement only the authorized repair artifacts without touching an unapproved live database. (5) [step-5] Verify the repair from every relevant migration state, a clean installation, representative data, repeated execution where idempotency is required, and the rollback or forward-repair path. (6) [step-6] Independently review the diagnosis, migration and schema diff, backup and rollback evidence, data invariants, tests, and remaining operational steps.
- Optional skills: `database-migrations`, `postgres-patterns`, `systematic-debugging`, `test-driven-development`, `safety-guard`, `verification-before-completion`.
- Optional Agent candidates: `plan`, `implementation-task`, `reviewer`.
- Optional delegation ideas: step-3: plan owns the state-aware repair, validation, stop-condition, and rollback plan without editing or applying changes; step-4: implementation-task owns only the authorized repair artifacts and regression tests; step-6: reviewer independently audits failure evidence, migration state, backup, repair diff, data invariants, tests, rollback, and operational boundary.
- Quality checks: exact failure and migration state evidence, backup status, reproducible transition, root-cause classification, data invariants, state-aware regression coverage, clean and partial-state verification, rollback or forward-repair evidence, and live-operation boundary.
- Scope notes: Diagnose from recorded state and disposable reproductions first; repository repair does not authorize a live recovery command; Do not rewrite already deployed migration history unless the exact tool, environment state, and user authorization make that operation safe and necessary.
- Risk notes: A mistaken repair can destroy data or make migration history diverge further; require backup evidence, explicit environment identity, bounded commands, and a stop condition before live recovery.
