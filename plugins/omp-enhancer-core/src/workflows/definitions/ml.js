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
        "text": "Reviewer independently audits the main-reviewed bounded diff and evidence without editing or mutating."
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
      "step-review: reviewer independently audits only the Main-reviewed bounded diff and evidence without project reads, commands, edits, or expensive jobs; parent reconciles scope and conclusions"
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
        "text": "Main searches local entry points, callers, focused tests, configuration, model and data contracts, and artifact metadata, then traces the smallest failing path across shape, dtype, device, preprocessing, model state, gradients, loaders, serialization, and train-serve parity."
      },
      {
        "id": "step-search-external",
        "text": "When current framework, device, serialization, or serving behavior could change the diagnosis and network is not forbidden, Main uses web_search to check versioned official documentation (preferred) and bounded community failure experience, records applicability, and keeps it separate from local artifact and runtime evidence. Queries must not contain model weights, datasets, or proprietary architecture details."
      },
      {
        "id": "step-plan",
        "text": "Main writes a detailed ML repair plan for parallel execution in dependency-ordered waves of vertical slices with non-overlapping write sets; every slice names exact files, dependencies, diagnosed cause, deterministic bounded test seam, exact command, expected valid RED, minimum production boundary, required Skills, device and resource budget, artifact exclusions, integration point, returned evidence, and affected serving contract."
      },
      {
        "id": "step-plan-review",
        "text": "The currently exposed plan Agent independently reviews Main's supplied complete parallel plan, assignments, local and external anchors, diagnosed cause, deterministic test seams, resource budget, and artifact boundary before any authorized production mutation."
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
        "id": "step-main-review",
        "text": "Main waits for task deliveries, integrates wave results, and verifies the smallest reproduction on the current tree; Main then examines the current tree, semantic diff, RED and GREEN evidence, root cause, shapes, device, determinism, evaluation or inference behavior, resource limits, serving correspondence, artifact provenance, and cross-slice interactions in an explicit MAIN REVIEW."
      },
      {
        "id": "step-review",
        "text": "After MAIN REVIEW, the native reviewer independently reviews the Main-reviewed bounded diff and supplied evidence for root cause, model and data assumptions, reproducibility, serving parity, artifact safety, and operational risk without reading the project or running a command."
      },
      {
        "id": "step-repair",
        "text": "Main validates each reviewer finding; for every material supported finding, task receives a bounded repair assignment, returns fresh affected evidence within the same artifact and compute limits, and Main refreshes verification and MAIN REVIEW before at most one fresh reviewer pass over the materially changed diff."
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
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow creates no gate, router, fork mandate, completion controller, or self-repeating repair path."
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
      "exact environment and artifact identity, current failure evidence, data and tensor contract trace, deterministic reproduction, complete plan-review disposition, parallel vertical slices with exclusive write ownership, task-owned RED-before-production and same-command GREEN, root-cause regression, focused repair, current-revision execution, Main self-review, reviewer reconciliation, serving correspondence, and artifact provenance"
    ],
    "riskNotes": [
      "ML debugging can consume substantial compute or mutate datasets and artifacts; use bounded fixtures and preserve provenance."
    ],
    "roles": [
      "plan",
      "task",
      "reviewer"
    ],
    "delegation": [
      "step-plan-review: plan independently reviews Main's supplied complete parallel deterministic repair plan, write sets, assignments, evidence seams, compute budget, and artifact boundary without editing files or running expensive jobs",
      "step-task-batch: task receives all runnable independent ML slices for the wave in the same native tasks[] batch with exclusive write and resource budgets",
      "step-task-tdd: task owns its complete vertical RED -> GREEN -> REFACTOR slice, including the deterministic test, minimum production repair, same-command evidence, and protected-artifact exclusions",
      "step-main-review: Main waits, integrates, verifies the current tree, and completes MAIN REVIEW before reviewer is assigned",
      "step-review: reviewer independently audits only the Main-reviewed bounded diff and supplied ML evidence without project reads, commands, edits, or expensive jobs",
      "step-repair: task receives only a Main-validated supported finding as a bounded repair and returns fresh affected evidence for Main re-review"
    ]
  }
];
