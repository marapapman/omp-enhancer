export const codeWorkflows = [
  {
    "id": "code.dev",
    "chooseWhen": "Substantive code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, or review when no OMP plugin, database, ML, network, writing, research, design, or release card better owns the central deliverable.",
    "composeWith": [
      "security.review",
      "release.publish"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Establish the requested outcome, mutation authority, acceptance criteria, repository instructions, dirty-tree boundary, exact failure or baseline evidence, and the smallest useful verification surface."
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
        "text": "Main records every accepted, rejected, and unresolved plan finding, rebases only affected TODO rows, and freezes complete bounded assignments with exclusive write ownership before dispatch."
      },
      {
        "id": "step-task-batch",
        "text": "For each wave, in the same native task tasks[] batch, Main sends all runnable independent slices, while dependent slices wait for their declared integration anchors and a single safe slice remains one task rather than manufactured parallelism."
      },
      {
        "id": "step-task-tdd",
        "text": "Each task owns one complete vertical slice: make its public-behavior test mutation first, run the exact focused command and return a valid RED assertion, make the minimum production change within its exclusive write set, rerun the same command for GREEN, refactor only while green, rerun affected evidence, and return the bounded diff and exact command results."
      },
      {
        "id": "step-review",
        "text": "The native reviewer independently reviews the bounded semantic diff and supplied evidence for the complete integrated change, including Main-authored edits, without a project read or command, returning concrete findings or an explicit no-finding result without repair or completion authority."
      },
      {
        "id": "step-repair",
        "text": "Main validates every reviewer finding against current evidence; for each material supported finding, Main gives task a bounded repair assignment, task repairs within an exclusive write set and returns fresh affected evidence; Main integrates and runs focused verification, and allows at most one fresh reviewer pass over the materially changed diff."
      },
      {
        "id": "step-report",
        "text": "Report changed and inspected paths, plan and review dispositions, task deliveries, RED and GREEN evidence, exact verification results, external-source limitations, unresolved risk, and untouched user changes; perform commit, push, release, deployment, or upgrade only when explicitly authorized."
      }
    ],
    "scopeNotes": [
      "A plan-only, diagnosis-only, test-analysis, or read-only review request does not authorize a production mutation; Main follows the user's requested outcome inside the same lifecycle.",
      "When no meaningful test seam exists, state why and use the strongest available contract, build, static, replay, or runtime evidence without fabricating a RED.",
      "The number of slices follows real independent work, dependencies, exclusive write ownership, and native capacity; do not manufacture parallelism or split tests from their production slice.",
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; missing delegation is not invented success.",
      "This card is Agent-owned guidance, not a gate, router, fork mandate, completion controller, or self-repeating repair mechanism.",
      "Main never self-induces a fallback by skipping brief, input, or checkpoint preparation",
      "The named audit Agent reviews the complete change regardless of who wrote the code — task slices, integration edits, and Main-authored code alike; the audit and plan-review checkpoints fall back only when the named Agent is unavailable, and Main records that concrete unavailability on the affected row instead of proceeding unreviewed."
    ],
    "skills": [
      "code-development"
    ],
    "qualityChecks": [
      "acceptance-to-file coverage, local entry-to-caller-to-test trace, current official and community evidence when decision-relevant, complete plan-review disposition, parallel vertical slices with non-overlapping write sets, task-owned RED-before-production and same-command GREEN evidence, lifecycle verification of the current semantic diff and cross-slice interactions, bounded reviewer evidence, finding reconciliation, and explicit authority and limitation reporting, author-neutral reviewer audit of the complete change including Main-authored edits, unavailability-only plan-review and code-review fallbacks recorded concretely"
    ],
    "riskNotes": [
      "External examples can be stale or inapplicable, and broad code searches can create noise; record versions, prefer primary documentation for behavior, and use community reports as leads rather than local truth.",
      "Overlapping write sets, hidden dependencies, or horizontal test and production assignments can invalidate parallel evidence; change wave boundaries or keep the complete vertical slice with one task.",
      "Repeated review without materially changed input wastes context and can create churn; request a fresh review only after the plan, semantic diff, or evidence changed."
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
      "step-task-batch: task receives every runnable independent vertical slice for the wave in the same native tasks[] batch, with one task per exclusive write set and no child ownership of the parent TODO",
      "step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the public-behavior test mutation, valid RED, minimum production change, same-command GREEN, bounded refactor, and exact returned evidence",
      "step-review: reviewer independently reviews the bounded semantic diff and supplied evidence covering task deliveries and Main-authored edits alike, does not read the project or run commands, and returns findings without repair or completion authority",
      "step-repair: task receives only a Main-validated supported finding as a bounded repair and returns fresh evidence; Main integrates and dispatches at most one fresh affected reviewer pass"
    ]
  }
];
