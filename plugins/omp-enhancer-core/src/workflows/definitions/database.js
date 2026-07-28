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
      },
      {
        "id": "step-review",
        "text": "Reviewer independently audits the bounded diff and evidence without editing or mutating."
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
      "task",
      "reviewer"
    ],
    "delegation": [
      "steps-2-4: task owns a bounded read-only database audit slice and returns concrete artifact and evidence findings without editing, mutating, or applying changes; the parent reconciles scope and conclusions",
      "step-review: reviewer independently audits only the bounded diff and evidence without project reads, commands, edits, or live operations; parent reconciles scope and conclusions"
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
        "text": "Main writes a bounded evidence brief and delegates search local code to scout — entry points from fast repository search, callers, consumers, adjacent tests, configuration, and source-vs-generated-vs-packaged-vs-installed anchors; Main integrates the returned evidence and performs no broad repository search itself"
      },
      {
        "id": "step-search-external",
        "text": "When current library, toolchain, API, design, failure, or performance practice could change the decision and network is not forbidden, Main delegates one bounded external pass to librarian (official documentation first, bounded community experience second), keeps external advice separate from local evidence, and records version and applicability; queries must not contain private code, secrets, or PII"
      },
      {
        "id": "step-plan",
        "text": "Main writes a frozen planning brief — requested outcome, mutation authority, acceptance criteria, integrated evidence anchors, slice boundaries, and evidence bar — and delegates to the plan Agent the full detailed implementation and evidence plan: dependency-ordered parallel waves of vertical slices with IDs, acceptance targets, dependencies, exact files and non-overlapping write sets, public test seams, exact focused commands, expected valid RED, minimum production boundaries, required Skills, integration points, returned evidence, and the draft's own challenge findings; Main authors no plan detail beyond the brief"
      },
      {
        "id": "step-plan-review",
        "text": "The plan Agent's draft carries its challenge findings; Main reviews the complete plan, parallel waves, plan assignment map, and exclusive write sets, and requests at most one fresh plan Agent pass only when disposition materially changes the plan before any authorized production mutation, never on unchanged text"
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
        "id": "step-review",
        "text": "The native reviewer independently reviews the bounded diff and supplied evidence for backup, rollback, lock, data, compatibility, and release risk, covering the complete change including Main-authored edits, without reading the project or running a command."
      },
      {
        "id": "step-repair",
        "text": "Main validates each reviewer finding; for every material supported finding, task receives a bounded repair assignment, returns fresh affected evidence without live application, and Main integrates before at most one fresh reviewer pass over the materially changed diff."
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
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path.",
      "Main never self-induces a fallback by skipping brief, input, or checkpoint preparation",
      "The named audit Agent reviews the complete change regardless of who wrote the code — task slices, integration edits, and Main-authored code alike; the audit and plan-review checkpoints fall back only when the named Agent is unavailable, and Main records that concrete unavailability on the affected row instead of proceeding unreviewed."
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
      "current migration state, backup evidence, plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, compatibility order, bounded lock and downtime impact, data invariants, clean upgrade tests, rollback or forward-repair evidence, reviewer reconciliation, and exact execution boundary, author-neutral reviewer audit of the complete change including Main-authored edits, unavailability-only plan-review and code-review fallbacks recorded concretely"
    ],
    "riskNotes": [
      "Schema and data changes can be destructive or irreversible; use the host approval path and never infer authority over a live database."
    ],
    "roles": [
      "plan",
      "task",
      "reviewer",
      "scout",
      "librarian"
    ],
    "delegation": [
      "step-search-local: scout owns the bounded local evidence pass and returns exact anchors distinguishing repository source from generated, packaged, installed, or runtime truth",
      "step-search-external: librarian owns one bounded external pass over official documentation and community experience and returns versioned, applicability-tagged leads",
      "step-plan: plan drafts the complete implementation and evidence plan from Main's frozen brief, including its own challenge findings, without editing files",
      "step-plan-review: plan independently challenges Main's supplied complete parallel plan — write sets, dependencies, assignment inputs, test seams, local and external anchors, and evidence boundary — and drafted it from Main's frozen brief, with at most one fresh pass on materially rebased plans, without editing files",
      "step-task-batch: task receives all runnable independent database slices for the wave in the same native tasks[] batch with exclusive write ownership",
      "step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the focused test, minimum production and migration changes, same-command evidence, and prohibition on unapproved live application",
      "step-review: reviewer independently reviews the bounded diff and supplied evidence covering task deliveries and Main-authored edits alike, does not read the project or run commands, and returns findings without repair or completion authority",
      "step-repair: task repairs and returns fresh evidence for Main integration"
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
        "text": "Main writes a bounded evidence brief and delegates search local code to scout — entry points from fast repository search, callers, consumers, adjacent tests, configuration, and source-vs-generated-vs-packaged-vs-installed anchors; Main integrates the returned evidence and performs no broad repository search itself"
      },
      {
        "id": "step-search-external",
        "text": "When current library, toolchain, API, design, failure, or performance practice could change the decision and network is not forbidden, Main delegates one bounded external pass to librarian (official documentation first, bounded community experience second), keeps external advice separate from local evidence, and records version and applicability; queries must not contain private code, secrets, or PII"
      },
      {
        "id": "step-plan",
        "text": "Main writes a frozen planning brief — requested outcome, mutation authority, acceptance criteria, integrated evidence anchors, slice boundaries, and evidence bar — and delegates to the plan Agent the full detailed implementation and evidence plan: dependency-ordered parallel waves of vertical slices with IDs, acceptance targets, dependencies, exact files and non-overlapping write sets, public test seams, exact focused commands, expected valid RED, minimum production boundaries, required Skills, integration points, returned evidence, and the draft's own challenge findings; Main authors no plan detail beyond the brief"
      },
      {
        "id": "step-plan-review",
        "text": "The plan Agent's draft carries its challenge findings; Main reviews the complete plan, parallel waves, plan assignment map, and exclusive write sets, and requests at most one fresh plan Agent pass only when disposition materially changes the plan before any authorized production mutation, never on unchanged text"
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
        "id": "step-review",
        "text": "The native reviewer independently reviews the bounded diff and supplied evidence for diagnosis, migration state, backup, data, rollback, idempotency, and operational risk, covering the complete change including Main-authored edits, without reading the project or running a command."
      },
      {
        "id": "step-repair",
        "text": "Main validates each reviewer finding; for every material supported finding, task receives a bounded repository repair assignment, returns fresh affected evidence from disposable state, and Main integrates before at most one fresh reviewer pass over the materially changed diff."
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
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path.",
      "Main never self-induces a fallback by skipping brief, input, or checkpoint preparation",
      "The named audit Agent reviews the complete change regardless of who wrote the code — task slices, integration edits, and Main-authored code alike; the audit and plan-review checkpoints fall back only when the named Agent is unavailable, and Main records that concrete unavailability on the affected row instead of proceeding unreviewed."
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
      "exact failure and migration state evidence, backup status, reproducible transition, root-cause classification, complete plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, data invariants, state-aware regression coverage, clean and partial-state verification, reviewer reconciliation, rollback or forward-repair evidence, and live-operation boundary, author-neutral reviewer audit of the complete change including Main-authored edits, unavailability-only plan-review and code-review fallbacks recorded concretely"
    ],
    "riskNotes": [
      "A mistaken repair can destroy data or make migration history diverge further; require backup evidence, explicit environment identity, bounded commands, and a stop condition before live recovery."
    ],
    "roles": [
      "plan",
      "task",
      "reviewer",
      "scout",
      "librarian"
    ],
    "delegation": [
      "step-search-local: scout owns the bounded local evidence pass and returns exact anchors distinguishing repository source from generated, packaged, installed, or runtime truth",
      "step-search-external: librarian owns one bounded external pass over official documentation and community experience and returns versioned, applicability-tagged leads",
      "step-plan: plan drafts the complete implementation and evidence plan from Main's frozen brief, including its own challenge findings, without editing files",
      "step-plan-review: plan independently challenges Main's supplied complete parallel plan — write sets, dependencies, assignment inputs, test seams, local and external anchors, and evidence boundary — and drafted it from Main's frozen brief, with at most one fresh pass on materially rebased plans, without editing files",
      "step-task-batch: task receives all runnable independent migration-repair slices for the wave in the same native tasks[] batch with exclusive write ownership",
      "step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the failed-state test, minimum production repair, same-command evidence, and prohibition on unapproved live recovery",
      "step-review: reviewer independently reviews the bounded diff and supplied evidence covering task deliveries and Main-authored edits alike, does not read the project or run commands, and returns findings without repair or completion authority",
      "step-repair: task repairs and returns fresh evidence for Main integration"
    ]
  }
];
