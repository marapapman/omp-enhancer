---
name: mle-workflow
description: Review, debug, or build production machine-learning systems with explicit data contracts, leakage controls, reproducible training, evaluation, serving parity, monitoring, and rollback. Use beyond one-off exploratory notebooks.
origin: ECC
---

# Machine-Learning Engineering

Load this skill through `ml.review` or `ml.debug`, and compose normal code, test, security, database, performance, and fact-check workflows as the deliverable requires. ML expertise changes the evidence, not the Agent permission boundary.

## Scope First

Record:

- product decision affected by the model and the owner of that decision;
- unacceptable false positives, false negatives, latency, cost, privacy, and safety outcomes;
- data snapshot, entity grain, label source and timing, split policy, serving mode, and target environment;
- current baseline, promotion criteria, monitoring owner, fallback, and rollback artifact.

Do not assume supervised labels, GPUs, PyTorch, online serving, a feature store, A/B testing, or a heavyweight MLOps platform. Choose the smallest system that produces reproducible evidence.

## Review Lanes

### Data and Leakage

Trace collection, consent, retention, schema, point-in-time joins, missing values, duplicates, label availability, train/validation/test isolation, preprocessing fit, and feature availability at inference. Detect direct labels, post-outcome features, entity overlap, temporal leakage, and evaluation data reused during tuning.

### Training and Reproducibility

Bind every result to code revision, data snapshot, configuration, random seeds, dependency and hardware context, feature transform, model artifact digest, and exact command. Confirm checkpoints can be loaded safely and that preprocessing travels with the artifact.

### Evaluation

Require a simple baseline before added complexity. Choose metrics from mistake cost, then inspect calibration, meaningful slices, confidence intervals or repeated runs, threshold sensitivity, and robustness to missing or shifted input. Preserve production failures as regression fixtures where privacy permits.

### Serving and Operations

Compare training and serving schemas and transforms. Inspect batching, timeouts, cancellation, model selection, fallback, artifact compatibility, concurrency, resource use, logging, and PII exposure. Define shadow/canary evidence, delayed-label monitoring, drift signals, alert owner, refresh criteria, and tested rollback.

### Security and Supply Chain

Treat datasets, model files, notebooks, prompts, feature logs, and serialized objects as untrusted inputs. Check secrets, provenance, unsafe deserialization, dependency integrity, access control, poisoning exposure, and data exfiltration. Compose `security.review` for independent security evidence.

## Canonical Delegation

- Main performs bounded local and external search, owns authorized vertical TDD changes, runs exact commands, and validates every finding.
- `plan` independently reviews the supplied bounded repair or experiment plan without editing.
- `reviewer` performs the GREEN-after-diff ML-aware review with this skill and relevant framework skills.
- Measured latency, throughput, memory, accelerator utilization, or cost work stays inside `ml.debug` or `code.dev`; never optimize against an unrecorded baseline.
- Use `code-documentation` for runbooks and artifact/model-card updates supported by verified behavior.

## Evidence Contract

Report reproducibility metadata, leakage analysis, baseline and candidate metrics, slice results, serving-parity checks, current test commands and exit status, operational risks, and uncertainty. A metric improvement alone is not a release decision; promotion requires the predeclared quality, safety, latency, cost, and rollback criteria.
