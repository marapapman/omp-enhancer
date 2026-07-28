READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `network.debug` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `network.debug`

- Primary when: The task is to diagnose a concrete connectivity, routing, DNS, interface, BGP, firewall, policy, or management symptom using read-only evidence.
- Reference steps:
  1. [step-1] Characterize the symptom, affected endpoints, direction, timing, scope, last-known-good state, and recent changes.
  2. [step-search-local] Main searches local configuration, interface states, routing tables, recent changes, logs, and monitoring data to narrow the symptom scope before collecting operator-authorized evidence.
  3. [step-inspect] Collect the smallest host- or operator-authorized read-only evidence across the relevant link, interface, addressing, routing, DNS, policy, and application layers.
  4. [step-hypothesis] Form ranked hypotheses and test whether each explains every observed symptom without changing live state.
  5. [step-diagnose] Identify the root cause or the narrowest remaining uncertainty with command output, counters, routes, policy, logs, or configuration evidence.
  6. [step-audit] Before the report, the native reviewer independently audits the diagnosis deliverable and its read-only evidence — root-cause completeness, hypothesis discrimination, evidence-to-symptom correspondence, safe verification plan, and explicit remaining uncertainty — without project reads or live commands, returning concrete findings or an explicit no-finding result without repair or completion authority.
  7. [step-report] Return safe next actions, verification criteria, maintenance and rollback needs, and any evidence still required before a change.
- Agent candidates: `ecc-network-troubleshooter`, `reviewer`.
- Delegated checkpoints:
  - step-inspect: ecc-network-troubleshooter owns bounded read-only evidence collection, hypothesis testing, root-cause analysis, and the safe verification plan
  - step-hypothesis: ecc-network-troubleshooter owns bounded read-only evidence collection, hypothesis testing, root-cause analysis, and the safe verification plan
  - step-diagnose: ecc-network-troubleshooter owns bounded read-only evidence collection, hypothesis testing, root-cause analysis, and the safe verification plan
  - step-report: ecc-network-troubleshooter owns bounded read-only evidence collection, hypothesis testing, root-cause analysis, and the safe verification plan
  - step-audit: reviewer independently audits the diagnosis deliverable and evidence without project reads or live commands and returns findings without repair or completion authority
- Quality checks:
  - symptom correspondence, bounded read-only evidence, OSI and policy path coverage, hypothesis discrimination, root-cause completeness, safe verification, and explicit uncertainty, independent reviewer audit of the diagnosis deliverable with unavailability-only fallback recorded concretely
- Scope notes:
  - Diagnosis remains read-only; a recommended live change needs separate user authorization and host approval.
  - Do not collect broad device state when a smaller command set can distinguish the hypotheses.
  - The delegated deliverable is the independent audit; parent VERIFY integrates it and adds no second auditor unless the user requests one
  - The diagnosis audit checkpoint falls back only when native reviewer is unavailable; Main records that concrete unavailability on the affected row instead of shipping the diagnosis unreviewed. The audit is read-only and does not collect new device state.
- Risk notes:
  - Even diagnostic collection can expose secrets or burden devices; redact credentials and use bounded read-only commands.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. An audit checkpoint named by this card is delegated by default and falls back only when the named audit Agent is unavailable; the recorded fallback names that unavailability. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition. ORCHESTRATOR: Main is the orchestrator. Evidence gathering, planning, implementation, and audit checkpoints are delegated to the Agents named by the loaded card; Main keeps selection, TODO, assignment copy, delivery integration, permission and external-effect decisions, and the final response. Direct work exists only on DIRECT, on `agentic.simple`, or behind a concrete recorded fallback. Main never self-induces a fallback by skipping brief, input, or checkpoint preparation; a fallback= row names exactly one enumerated reason and the affected checkpoint.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.
ORCHESTRATOR: Main is the orchestrator. Evidence gathering, planning, implementation, and audit checkpoints are delegated to the Agents named by the loaded card; Main keeps selection, TODO, assignment copy, delivery integration, permission and external-effect decisions, and the final response. Direct work exists only on DIRECT, on `agentic.simple`, or behind a concrete recorded fallback. Main never self-induces a fallback by skipping brief, input, or checkpoint preparation; a fallback= row names exactly one enumerated reason and the affected checkpoint.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.