READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `ml.review` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `ml.review`

- Primary when: A read-only review of a production ML data, training, evaluation, artifact, inference, serving, monitoring, or rollback path.
- Reference steps:
  1. [step-1] Identify the product decision, model and data versions, prediction and data contracts, target revision, serving mode, metrics, and review scope.
  2. [step-2] Inspect data timing and lineage, leakage boundaries, split logic, preprocessing parity, training determinism, artifact identity, evaluation slices, serving fallbacks, and monitoring.
  3. [step-3] Validate material findings against tests, reproducible runs, recorded experiments, model and dataset metadata, or serving evidence without rerunning expensive work unless authorized.
  4. [step-4] Report prioritized findings with concrete code or artifact evidence, affected decision, trigger, impact, reproducibility limits, remediation, and verification.
  5. [step-review] Reviewer independently audits the main-reviewed bounded diff and evidence without editing or mutating.
- Agent candidates: `task`, `reviewer`.
- Delegated checkpoints:
  - steps-2-4: task owns a bounded read-only ML audit slice and returns concrete system and evidence findings without editing or mutating code, data, or artifacts; the parent reconciles scope and conclusions
  - step-review: reviewer independently audits only the Main-reviewed bounded diff and evidence without project reads, commands, edits, or expensive jobs; parent reconciles scope and conclusions
- Quality checks:
  - prediction and data contract correspondence, temporal leakage analysis, training reproducibility, evaluation and slice validity, artifact and serving parity, fallback and monitoring coverage, rollback, and explicit evidence limitations
- Scope notes:
  - Main owns the bounded review scope and final reconciliation; task may own a complete read-only audit slice, while the native reviewer remains reserved for an existing semantic diff or patch.
  - Do not treat an offline metric, notebook output, or provider evaluation as proof of production behavior without matching data, artifact, and serving evidence.
- Risk notes:
  - Model and dataset artifacts may contain sensitive data or unsafe serialized objects; inspect them through project-approved paths and preserve provenance.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.