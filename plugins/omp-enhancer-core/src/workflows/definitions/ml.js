export const mlWorkflows = [
  {
    "id": "ml.review",
    "chooseWhen": "The user asks for a read-only review of a production machine-learning data, training, evaluation, artifact, inference, serving, monitoring, or rollback path.",
    "composeWith": [
      "code.review",
      "code.test",
      "security.review",
      "factcheck.document",
      "performance.optimize"
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
      }
    ],
    "scopeNotes": [
      "Use the canonical reviewer with ML skills; a prompt-only ML reviewer does not create a distinct permission boundary.",
      "Do not treat an offline metric, notebook output, or provider evaluation as proof of production behavior without matching data, artifact, and serving evidence."
    ],
    "skills": [
      "mle-workflow",
      "pytorch-patterns",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "prediction and data contract correspondence, temporal leakage analysis, training reproducibility, evaluation and slice validity, artifact and serving parity, fallback and monitoring coverage, rollback, and explicit evidence limitations"
    ],
    "riskNotes": [
      "Model and dataset artifacts may contain sensitive data or unsafe serialized objects; inspect them through project-approved paths and preserve provenance."
    ],
    "roles": [
      "reviewer"
    ],
    "delegation": [
      "steps-2-4: reviewer independently audits the ML system with selected ML skills and reports evidence-backed findings without editing code, data, or artifacts"
    ]
  },
  {
    "id": "ml.debug",
    "chooseWhen": "A training, evaluation, model loading, tensor, device, gradient, data loader, artifact, batch inference, or online inference path fails and the user wants diagnosis or an authorized fix.",
    "composeWith": [
      "code.debug",
      "code.dev",
      "code.test",
      "ml.review",
      "performance.optimize"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Capture the exact command or request, code and dependency revision, model and dataset identifiers, device and precision, seed, environment, and current failure evidence."
      },
      {
        "id": "step-2",
        "text": "Trace the smallest failing path across data shape and dtype, device placement, preprocessing, model state, gradients, loaders, serialization, and train-serve parity."
      },
      {
        "id": "step-3",
        "text": "Plan the smallest repair and a deterministic regression that fails for the diagnosed cause rather than merely reducing the symptom."
      },
      {
        "id": "step-4",
        "text": "When repair is authorized, add the focused regression and implement only the planned code or configuration change without rewriting data or model artifacts unnecessarily."
      },
      {
        "id": "step-5",
        "text": "Rerun the smallest reproduction and relevant tests, then verify shapes, device, determinism, evaluation or inference behavior, resource limits, and any affected serving contract."
      },
      {
        "id": "step-6",
        "text": "Independently review the root-cause evidence, semantic diff, regression, model and data assumptions, reproducibility, and remaining operational risk."
      }
    ],
    "scopeNotes": [
      "Do not use a full training run when a small deterministic fixture can prove the repair.",
      "Data, checkpoints, caches, and generated models remain outside the write scope unless explicitly included."
    ],
    "skills": [
      "mle-workflow",
      "pytorch-patterns",
      "systematic-debugging",
      "test-driven-development",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "exact environment and artifact identity, current failure evidence, data and tensor contract trace, deterministic reproduction, root-cause regression, focused repair, current-revision execution, serving correspondence, and independent semantic review"
    ],
    "riskNotes": [
      "ML debugging can consume substantial compute or mutate datasets and artifacts; use bounded fixtures and preserve provenance."
    ],
    "roles": [
      "explore",
      "plan",
      "implementation-task",
      "reviewer"
    ],
    "delegation": [
      "steps-1-2: explore collects bounded read-only environment, code, data-contract, model, and failure-path evidence",
      "step-3: plan owns the deterministic repair and verification plan without editing files or running expensive jobs",
      "step-4: implementation-task owns only the authorized focused regression and repair",
      "step-6: reviewer independently audits the root cause, ML assumptions, diff, regression, reproducibility, and operational risk"
    ]
  }
];
