# ml workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.

## `ml.review`

- Use when: The user asks for a read-only review of a production machine-learning data, training, evaluation, artifact, inference, serving, monitoring, or rollback path.
- May compose with: `code.review`, `code.test`, `security.review`, `factcheck.document`, `performance.optimize`.
- Reference steps: (1) [step-1] Identify the product decision, model and data versions, prediction and data contracts, target revision, serving mode, metrics, and review scope. (2) [step-2] Inspect data timing and lineage, leakage boundaries, split logic, preprocessing parity, training determinism, artifact identity, evaluation slices, serving fallbacks, and monitoring. (3) [step-3] Validate material findings against tests, reproducible runs, recorded experiments, model and dataset metadata, or serving evidence without rerunning expensive work unless authorized. (4) [step-4] Report prioritized findings with concrete code or artifact evidence, affected decision, trigger, impact, reproducibility limits, remediation, and verification.
- Optional skills: `mle-workflow`, `pytorch-patterns`, `verification-before-completion`.
- Optional Agent candidates: `omp-target-auditor`.
- Optional delegation ideas: steps-2-4: omp-target-auditor independently audits the bounded ML system with selected ML skills and reports evidence-backed findings without editing code, data, or artifacts.
- Quality checks: prediction and data contract correspondence, temporal leakage analysis, training reproducibility, evaluation and slice validity, artifact and serving parity, fallback and monitoring coverage, rollback, and explicit evidence limitations.
- Scope notes: Use omp-target-auditor with ML skills for an existing bounded ML target; the OMP native reviewer remains reserved for a supplied patch or diff; Do not treat an offline metric, notebook output, or provider evaluation as proof of production behavior without matching data, artifact, and serving evidence.
- Risk notes: Model and dataset artifacts may contain sensitive data or unsafe serialized objects; inspect them through project-approved paths and preserve provenance.

## `ml.debug`

- Use when: A training, evaluation, model loading, tensor, device, gradient, data loader, artifact, batch inference, or online inference path fails and the user wants diagnosis or an authorized fix.
- May compose with: `code.debug`, `code.dev`, `code.test`, `ml.review`, `performance.optimize`.
- Reference steps: (1) [step-1] Capture the exact command or request, code and dependency revision, model and dataset identifiers, device and precision, seed, environment, and current failure evidence. (2) [step-2] Trace the smallest failing path across data shape and dtype, device placement, preprocessing, model state, gradients, loaders, serialization, and train-serve parity. (3) [step-3] Plan the smallest repair and a deterministic regression that fails for the diagnosed cause rather than merely reducing the symptom. (4) [step-4] When repair is authorized, add the focused regression and implement only the planned code or configuration change without rewriting data or model artifacts unnecessarily. (5) [step-5] Rerun the smallest reproduction and relevant tests, then verify shapes, device, determinism, evaluation or inference behavior, resource limits, and any affected serving contract. (6) [step-6] Independently review the root-cause evidence, semantic diff, regression, model and data assumptions, reproducibility, and remaining operational risk.
- Optional skills: `mle-workflow`, `pytorch-patterns`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`.
- Optional Agent candidates: `explore`, `plan`, `implementation-task`, `reviewer`.
- Optional delegation ideas: steps-1-2: explore collects bounded read-only environment, code, data-contract, model, and failure-path evidence; step-3: plan owns the deterministic repair and verification plan without editing files or running expensive jobs; step-4: implementation-task owns only the authorized focused regression and repair; step-6: reviewer independently audits the root cause, ML assumptions, diff, regression, reproducibility, and operational risk.
- Quality checks: exact environment and artifact identity, current failure evidence, data and tensor contract trace, deterministic reproduction, root-cause regression, focused repair, current-revision execution, serving correspondence, and independent semantic review.
- Scope notes: Do not use a full training run when a small deterministic fixture can prove the repair; Data, checkpoints, caches, and generated models remain outside the write scope unless explicitly included.
- Risk notes: ML debugging can consume substantial compute or mutate datasets and artifacts; use bounded fixtures and preserve provenance.
