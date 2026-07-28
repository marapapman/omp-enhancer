export const mlWorkflows = [
  {
    "id": "ml.review",
    "chooseWhen": "A read-only review of a production ML data, training, evaluation, artifact, inference, serving, monitoring, or rollback path.",
    "composeWith": [
      "security.review",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Identify the product decision, model and data versions, prediction and data contracts, target revision, serving mode, metrics, and review scope."
      },
      {
        "id": "step-2",
        "text": "Inspect data timing and lineage, leakage boundaries, split logic, preprocessing parity, training determinism, artifact identity, evaluation slices, serving fallbacks, and monitoring."
      },
      {
        "id": "step-3",
        "text": "Validate material findings against tests, reproducible runs, recorded experiments, model and dataset metadata, or serving evidence without rerunning expensive work unless authorized."
      },
      {
        "id": "step-4",
        "text": "Report prioritized findings with concrete code or artifact evidence, affected decision, trigger, impact, reproducibility limits, remediation, and verification."
      },
      {
        "id": "step-review",
        "text": "Reviewer independently audits the bounded diff and evidence without editing or mutating."
      }
    ],
    "scopeNotes": [
      "Main owns the bounded review scope and final reconciliation; task may own a complete read-only audit slice, while the native reviewer remains reserved for an existing semantic diff or patch.",
      "Do not treat an offline metric, notebook output, or provider evaluation as proof of production behavior without matching data, artifact, and serving evidence."
    ],
    "skills": [
      "mle-workflow",
      "pytorch-patterns",
      "code-development"
    ],
    "catalogSkills": [
      "mle-workflow",
      "pytorch-patterns"
    ],
    "qualityChecks": [
      "prediction and data contract correspondence, temporal leakage analysis, training reproducibility, evaluation and slice validity, artifact and serving parity, fallback and monitoring coverage, rollback, and explicit evidence limitations"
    ],
    "riskNotes": [
      "Model and dataset artifacts may contain sensitive data or unsafe serialized objects; inspect them through project-approved paths and preserve provenance."
    ],
    "roles": [
      "task",
      "reviewer"
    ],
    "delegation": [
      "steps-2-4: task owns a bounded read-only ML audit slice and returns concrete system and evidence findings without editing or mutating code, data, or artifacts; the parent reconciles scope and conclusions",
      "step-review: reviewer independently audits only the bounded diff and evidence without project reads, commands, edits, or expensive jobs; parent reconciles scope and conclusions"
    ]
  },
  {
    "id": "ml.debug",
    "chooseWhen": "A training, evaluation, model, tensor, device, data-loader, artifact, batch, or online-inference failure needs diagnosis or an authorized fix.",
    "composeWith": [
      "ml.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Capture the exact command or request, code and dependency revision, model and dataset identifiers, device and precision, seed, environment, and current failure evidence."
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
        "text": "Main records every accepted, rejected, and unresolved plan finding, rebases only affected slices, and freezes complete assignments with exclusive write ownership and explicit data, checkpoint, cache, and generated-model exclusions."
      },
      {
        "id": "step-task-batch",
        "text": "For each wave, Main submits all runnable independent slices in the same native task tasks[] batch; dependency-bound slices wait for their declared artifact or integration anchor, and each task stays within its bounded compute and write budget."
      },
      {
        "id": "step-task-tdd",
        "text": "Each task owns one complete vertical ML slice: change its focused deterministic public-behavior test first, prove the expected valid RED on a bounded fixture, make the minimum production code or configuration change without rewriting protected artifacts, rerun the same command for GREEN, refactor only while green, and return the bounded diff and exact resource-aware evidence."
      },
      {
        "id": "step-review",
        "text": "The native reviewer independently reviews the bounded diff and supplied evidence for root cause, model and data assumptions, reproducibility, serving parity, artifact safety, and operational risk without reading the project or running a command."
      },
      {
        "id": "step-repair",
        "text": "Main validates each reviewer finding; for every material supported finding, task receives a bounded repair assignment, returns fresh affected evidence within the same artifact and compute limits; Main integrates and runs focused verification, and allows at most one fresh reviewer pass over the materially changed diff."
      },
      {
        "id": "step-report",
        "text": "Report the diagnosed cause, plan and review dispositions, task deliveries, exact bounded commands and exits, resource and artifact limitations, fresh verification, unresolved serving risk, and every data or model artifact left untouched."
      }
    ],
    "scopeNotes": [
      "Do not use a full training run when a small deterministic fixture can prove the repair.",
      "Data, checkpoints, caches, and generated models remain outside the write scope unless explicitly included.",
      "Slice count follows real independent vertical work, artifact dependencies, exclusive write ownership, bounded compute, and native capacity; one safe slice remains one task.",
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path.",
      "Main never self-induces a fallback by skipping brief, input, or checkpoint preparation"
    ],
    "skills": [
      "mle-workflow",
      "pytorch-patterns",
      "code-development"
    ],
    "catalogSkills": [
      "mle-workflow",
      "pytorch-patterns"
    ],
    "qualityChecks": [
      "exact environment and artifact identity, current failure evidence, data and tensor contract trace, deterministic reproduction, complete plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, root-cause regression, focused repair, current-revision execution, lifecycle verification, reviewer reconciliation, serving correspondence, and artifact provenance"
    ],
    "riskNotes": [
      "ML debugging can consume substantial compute or mutate datasets and artifacts; use bounded fixtures and preserve provenance."
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
      "step-task-batch: task receives all runnable independent ML slices for the wave in the same native tasks[] batch with exclusive write and resource budgets",
      "step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the deterministic test, minimum production repair, same-command evidence, and protected-artifact exclusions",
      "step-review: reviewer independently audits only the bounded diff and supplied ML evidence without project reads, commands, edits, or expensive jobs",
      "step-repair: task receives only a Main-validated supported finding as a bounded repair and returns fresh evidence; Main integrates and dispatches at most one fresh affected reviewer pass"
    ]
  }
];
