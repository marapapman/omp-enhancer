---
name: mle-workflow
description: Review, debug, or build production machine-learning systems with explicit data contracts, leakage controls, reproducible training, evaluation, serving parity, monitoring, and rollback. Use beyond one-off exploratory notebooks.
origin: ECC
---

# Machine-Learning Engineering

## OMP Composition Boundary

Main owns cross-Skill composition: it selects every supporting workflow and Skill
in the initial `WORKFLOW PLAN` and loads each declared Skill before
`WORKFLOW READY`. After load, this loaded Skill does not reselect, reroute,
auto-load, or hand off to another Skill. It does not replace the parent TODO or
Main's Agent choice. An exact same-namespace
`skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI explicitly exposed here may be
read in one `RESOURCE EXTENSION` before `COMMIT`; cross-namespace candidates
remain initial-PLAN only.

Main chooses the Primary and Add-ons in the initial `WORKFLOW PLAN`. Typical fit
is a read-only production-ML review (`ml.review`), a concrete failure or fix
(`ml.debug`), and a new build or implementation (`code.dev`); these are
non-routing fit hints, not instructions to change the committed workflow. Compose
security, database, performance, and fact-check evidence only when the matching
Add-ons were already selected. ML expertise changes the evidence, not the Agent
permission boundary.

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

Treat datasets, model files, notebooks, prompts, feature logs, and serialized objects as untrusted inputs. Check secrets, provenance, unsafe deserialization, dependency integrity, access control, poisoning exposure, and data exfiltration. Include independent `security.review` evidence only when Main selected that Add-on in the initial plan.

## Canonical Delegation

- Only substantive mutation under `ml.debug` or `code.dev` uses the code lifecycle: Main writes the dependency-aware implementation plan, plugin `plan` reviews it, native `task` owns the complete vertical RED-GREEN-REFACTOR slice, Main integrates and writes `MAIN REVIEW`, and native `reviewer` receives the Main-reviewed bounded diff and evidence.
- Under `ml.review`, delegate project inspection as a bounded read-only native `task`: it may inspect and report but does not mutate the project.
- Native `reviewer` is only for an existing semantic diff or patch plus bounded evidence; it is not the project-reading Agent for a read-only ML audit.
- Main validates every finding and records plan-review dispositions. A supported mutation repair returns to native `task` as a new bounded assignment; unavailable or unsafe delegation is recorded before any host-authorized direct fallback.
- Main chooses Agents from the current dynamic Available Agents and chooses fork width from real independence, dependencies, write ownership, and capacity.
- Measured latency, throughput, memory, accelerator utilization, or cost work stays inside `ml.debug` or `code.dev`; never optimize against an unrecorded baseline.
- For independently requested runbooks or artifact/model-card updates, the non-routing PLAN candidate is `skill://ecc-skill-catalog/code-documentation/SKILL.md`.

## Evidence Contract

Report reproducibility metadata, leakage analysis, baseline and candidate metrics, slice results, serving-parity checks, current test commands and exit status, operational risks, and uncertainty. A metric improvement alone is not a release decision; promotion requires the predeclared quality, safety, latency, cost, and rollback criteria.
