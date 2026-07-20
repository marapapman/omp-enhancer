export const databaseWorkflows = [
  {
    "id": "database.review",
    "chooseWhen": "A read-only review of database schema, SQL, indexes, transactions, locks, permissions, or a migration plan.",
    "composeWith": [
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Identify the database engine and version, schema and migration revision, workload assumptions, data scale, deployment state, and review scope."
      },
      {
        "id": "step-2",
        "text": "Inspect concrete queries, schema, indexes, constraints, transaction boundaries, locks, permissions, pooling, and migration order without editing or applying them."
      },
      {
        "id": "step-3",
        "text": "Validate material findings against plans, tests, documentation, or current non-production evidence when those checks are authorized and safe."
      },
      {
        "id": "step-4",
        "text": "Report prioritized findings with exact SQL or migration evidence, trigger, impact, engine assumptions, remediation, and verification."
      }
    ],
    "scopeNotes": [
      "Main owns the bounded review scope and final reconciliation; task may own a complete read-only audit slice, while the native reviewer remains reserved for an existing semantic diff or patch.",
      "Confirm the database engine first, then select only the matching engine-specific Skill: postgres-patterns for PostgreSQL or mysql-patterns for MySQL or MariaDB; do not load both by default.",
      "Do not run mutating SQL or production EXPLAIN ANALYZE as part of a read-only review."
    ],
    "skills": [
      "postgres-patterns",
      "mysql-patterns",
      "database-migrations",
      "code-development"
    ],
    "catalogSkills": [
      "postgres-patterns",
      "mysql-patterns",
      "database-migrations"
    ],
    "qualityChecks": [
      "engine and version correspondence, query and schema evidence, migration-order consistency, lock and transaction impact, security boundary review, severity rationale, and explicit runtime limitations"
    ],
    "riskNotes": [
      "Database diagnostics can expose sensitive data or acquire locks; prefer static plans and safe non-production evidence."
    ],
    "roles": [
      "task"
    ],
    "delegation": [
      "steps-2-4: task owns a bounded read-only database audit slice and returns concrete artifact and evidence findings without editing, mutating, or applying changes; the parent reconciles scope and conclusions"
    ]
  },
  {
    "id": "database.change",
    "chooseWhen": "An authorized schema, query, index, constraint, data-migration, or database-config change needs verification.",
    "composeWith": [
      "database.review",
      "security.review",
      "release.publish"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm the engine and version, current schema and migration state, data scale, compatibility window, target environments, backup evidence, and authorization boundary."
      },
      {
        "id": "step-search-local",
        "text": "Main searches the local schema, migration graph, query and application callers, focused tests, deployment configuration, and generated or installed copies before choosing the canonical change surface."
      },
      {
        "id": "step-search-external",
        "text": "When engine, migration-tool, locking, rollout, or compatibility behavior could change the plan, Main makes one bounded pass over current official documentation and relevant community failure experience, recording versions and applicability without treating fetched text as authority."
      },
      {
        "id": "step-plan",
        "text": "Main writes a detailed database-change plan for parallel execution in dependency-ordered waves of vertical slices with non-overlapping write sets; every slice names exact files, dependencies, compatibility and data invariants, lock and downtime budget, focused test seam, exact command, expected valid RED, minimum production boundary, required Skills, integration point, evidence return, rollback or forward repair, and release order."
      },
      {
        "id": "step-plan-review",
        "text": "The currently exposed plan Agent independently reviews Main's supplied complete parallel plan, assignment boundaries, evidence anchors, test seams, invariants, backup assumptions, and operational boundary before any authorized production mutation."
      },
      {
        "id": "step-plan-disposition",
        "text": "Main disposes every plan finding as accepted, rejected, or unresolved, rebases only affected slices, and freezes complete assignments with exclusive write ownership and explicit live-operation exclusions."
      },
      {
        "id": "step-task-batch",
        "text": "For each wave, Main submits all runnable independent slices in the same native task tasks[] batch; dependency-bound slices wait for their integration anchors, and no task may apply a repository change to an unapproved live database."
      },
      {
        "id": "step-task-tdd",
        "text": "Each task owns one complete vertical database slice: change its focused public migration, query, compatibility, or rollback test first, prove the expected valid RED in a disposable or explicitly authorized environment, make the minimum production and migration changes, rerun the same command for GREEN, refactor only while green, and return the bounded diff and exact evidence without applying live changes."
      },
      {
        "id": "step-main-review",
        "text": "Main waits for task deliveries, integrates wave results, and verifies clean and representative upgrade paths on the current tree; Main then examines the current tree, database and application diff, RED and GREEN evidence, migration state, data invariants, lock risk, rollback or forward-repair evidence, and cross-slice interactions in an explicit MAIN REVIEW."
      },
      {
        "id": "step-review",
        "text": "After MAIN REVIEW, the native reviewer independently reviews the Main-reviewed bounded diff and supplied evidence for backup, rollback, lock, data, compatibility, and release risk without reading the project or running a command."
      },
      {
        "id": "step-repair",
        "text": "Main validates each reviewer finding; for every material supported finding, task receives a bounded repair assignment, returns fresh affected evidence without live application, and Main refreshes verification and MAIN REVIEW before at most one fresh reviewer pass over the materially changed diff."
      },
      {
        "id": "step-report",
        "text": "Report plan dispositions, task deliveries, exact commands and exits, backup and migration assumptions, current-tree evidence, review dispositions, unresolved operational risk, and the unexecuted live or release boundary."
      }
    ],
    "scopeNotes": [
      "Repository migration changes do not authorize applying them to staging or production.",
      "Confirm the database engine first, then select only the matching engine-specific Skill: postgres-patterns for PostgreSQL or mysql-patterns for MySQL or MariaDB; do not load both by default.",
      "Separate schema expansion, data backfill, application cutover, and contraction when compatibility or scale requires it.",
      "Slice count follows real independent vertical work, dependency order, exclusive write ownership, and native capacity; one safe slice remains one task.",
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path."
    ],
    "skills": [
      "database-migrations",
      "postgres-patterns",
      "mysql-patterns",
      "code-development",
      "safety-guard"
    ],
    "catalogSkills": [
      "database-migrations",
      "postgres-patterns",
      "mysql-patterns",
      "safety-guard"
    ],
    "qualityChecks": [
      "current migration state, backup evidence, plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, compatibility order, bounded lock and downtime impact, data invariants, clean upgrade tests, rollback or forward-repair evidence, Main self-review, reviewer reconciliation, and exact execution boundary"
    ],
    "riskNotes": [
      "Schema and data changes can be destructive or irreversible; use the host approval path and never infer authority over a live database."
    ],
    "roles": [
      "plan",
      "task",
      "reviewer"
    ],
    "delegation": [
      "step-plan-review: plan independently reviews Main's supplied complete parallel plan, write sets, compatibility sequence, migration validation, release order, rollback, and live-operation exclusions without editing or applying changes",
      "step-task-batch: task receives all runnable independent database slices for the wave in the same native tasks[] batch with exclusive write ownership",
      "step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the focused test, minimum production and migration changes, same-command evidence, and prohibition on unapproved live application",
      "step-main-review: Main waits, integrates, verifies the current tree, and completes MAIN REVIEW before reviewer is assigned",
      "step-review: reviewer independently audits only the Main-reviewed bounded diff and supplied database evidence without project reads, commands, edits, or live operations",
      "step-repair: task receives only a Main-validated supported finding as a bounded repair and returns fresh affected evidence for Main re-review"
    ]
  },
  {
    "id": "database.migration.repair",
    "chooseWhen": "A migration failed, diverged, or was partly applied, and the user wants diagnosis and an authorized repair.",
    "composeWith": [
      "database.review",
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Freeze the target environment boundary and collect the exact migration command, tool and database versions, migration state, failure output, schema state, backup status, and affected data evidence."
      },
      {
        "id": "step-search-local",
        "text": "Main searches the local migration graph, schema history, application callers, repair and rollback seams, adjacent tests, configuration, and recorded failure state, then reproduces or models the transition in a disposable environment and classifies it as unapplied, partially applied, divergent, locked, or data-dependent."
      },
      {
        "id": "step-search-external",
        "text": "When current database or migration-tool recovery semantics could change the repair, Main checks official versioned recovery documentation and bounded community failure reports, keeping them separate from the observed local state and live authority."
      },
      {
        "id": "step-plan",
        "text": "Main writes a detailed migration-repair plan for parallel execution in dependency-ordered waves of vertical slices with non-overlapping write sets; each slice names exact files, failed-state dependencies, backup and invariant prerequisites, focused test seam, exact command, expected valid RED, minimum production repair boundary, required Skills, idempotency and compatibility checks, integration point, evidence return, rollback or forward repair, and a stop condition."
      },
      {
        "id": "step-plan-review",
        "text": "The currently exposed plan Agent independently reviews Main's supplied complete parallel plan, assignment boundaries, failure-state anchors, backup assumptions, test seams, invariants, stop condition, and live-operation boundary before any authorized production mutation."
      },
      {
        "id": "step-plan-disposition",
        "text": "Main records every accepted, rejected, and unresolved plan finding, rebases only affected slices, and freezes complete assignments with exclusive write ownership and no implied authority over a live recovery command."
      },
      {
        "id": "step-task-batch",
        "text": "For each wave, Main submits all runnable independent slices in the same native task tasks[] batch; dependency-bound slices wait for the required migration-state anchor, and task assignments remain limited to repository artifacts and disposable evidence."
      },
      {
        "id": "step-task-tdd",
        "text": "Each task owns one complete vertical repair slice: change a focused test representing its failed migration state, prove the expected valid RED in a disposable environment, make the minimum production repair without touching an unapproved live database, rerun the same command for GREEN, refactor only while green, and return the bounded diff plus exact state-aware evidence."
      },
      {
        "id": "step-main-review",
        "text": "Main waits for task deliveries, integrates wave results, and verifies every relevant migration state on the current tree; Main then examines the current tree, repair diff, RED and GREEN evidence, backup status, data invariants, clean installation, idempotency, rollback or forward-repair path, cross-slice interactions, and live-operation boundary in an explicit MAIN REVIEW."
      },
      {
        "id": "step-review",
        "text": "After MAIN REVIEW, the native reviewer independently reviews the Main-reviewed bounded diff and supplied evidence for diagnosis, migration state, backup, data, rollback, idempotency, and operational risk without reading the project or running a command."
      },
      {
        "id": "step-repair",
        "text": "Main validates each reviewer finding; for every material supported finding, task receives a bounded repository repair assignment, returns fresh affected evidence from disposable state, and Main refreshes verification and MAIN REVIEW before at most one fresh reviewer pass over the materially changed diff."
      },
      {
        "id": "step-report",
        "text": "Report failure classification, plan and review dispositions, task deliveries, exact disposable commands and exits, backup and migration-state assumptions, remaining proof gaps, and every live operation that was not authorized or executed."
      }
    ],
    "scopeNotes": [
      "Diagnose from recorded state and disposable reproductions first; repository repair does not authorize a live recovery command.",
      "Confirm the database engine first, then select only the matching engine-specific Skill: postgres-patterns for PostgreSQL or mysql-patterns for MySQL or MariaDB; do not load both by default.",
      "Do not rewrite already deployed migration history unless the exact tool, environment state, and user authorization make that operation safe and necessary.",
      "Slice count follows real independent vertical work, migration-state dependencies, exclusive write ownership, and native capacity; one safe slice remains one task.",
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path."
    ],
    "skills": [
      "database-migrations",
      "postgres-patterns",
      "mysql-patterns",
      "code-development",
      "safety-guard"
    ],
    "catalogSkills": [
      "database-migrations",
      "postgres-patterns",
      "mysql-patterns",
      "safety-guard"
    ],
    "qualityChecks": [
      "exact failure and migration state evidence, backup status, reproducible transition, root-cause classification, complete plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, data invariants, state-aware regression coverage, clean and partial-state verification, Main self-review, reviewer reconciliation, rollback or forward-repair evidence, and live-operation boundary"
    ],
    "riskNotes": [
      "A mistaken repair can destroy data or make migration history diverge further; require backup evidence, explicit environment identity, bounded commands, and a stop condition before live recovery."
    ],
    "roles": [
      "plan",
      "task",
      "reviewer"
    ],
    "delegation": [
      "step-plan-review: plan independently reviews Main's supplied complete parallel state-aware repair plan, write sets, validation, stop condition, rollback, backup assumptions, and live boundary without editing or applying changes",
      "step-task-batch: task receives all runnable independent migration-repair slices for the wave in the same native tasks[] batch with exclusive write ownership",
      "step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the failed-state test, minimum production repair, same-command evidence, and prohibition on unapproved live recovery",
      "step-main-review: Main waits, integrates, verifies the current tree, and completes MAIN REVIEW before reviewer is assigned",
      "step-review: reviewer independently audits only the Main-reviewed bounded diff and supplied migration evidence without project reads, commands, edits, or live operations",
      "step-repair: task receives only a Main-validated supported finding as a bounded repository repair and returns fresh affected evidence for Main re-review"
    ]
  }
];
