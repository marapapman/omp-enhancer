# `ml.review` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `ml.review`

- Primary when: The user asks for a read-only review of a production machine-learning data, training, evaluation, artifact, inference, serving, monitoring, or rollback path.
- Reference steps:
  1. [step-1] Identify the product decision, model and data versions, prediction and data contracts, target revision, serving mode, metrics, and review scope.
  2. [step-2] Inspect data timing and lineage, leakage boundaries, split logic, preprocessing parity, training determinism, artifact identity, evaluation slices, serving fallbacks, and monitoring.
  3. [step-3] Validate material findings against tests, reproducible runs, recorded experiments, model and dataset metadata, or serving evidence without rerunning expensive work unless authorized.
  4. [step-4] Report prioritized findings with concrete code or artifact evidence, affected decision, trigger, impact, reproducibility limits, remediation, and verification.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - steps-2-4: the parent directly audits the bounded ML system and evidence without editing code, data, or artifacts
- Quality checks:
  - prediction and data contract correspondence, temporal leakage analysis, training reproducibility, evaluation and slice validity, artifact and serving parity, fallback and monitoring coverage, rollback, and explicit evidence limitations
- Scope notes:
  - Main owns the bounded target review directly; the native reviewer remains reserved for an existing semantic diff or patch.
  - Do not treat an offline metric, notebook output, or provider evaluation as proof of production behavior without matching data, artifact, and serving evidence.
- Risk notes:
  - Model and dataset artifacts may contain sensitive data or unsafe serialized objects; inspect them through project-approved paths and preserve provenance.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
