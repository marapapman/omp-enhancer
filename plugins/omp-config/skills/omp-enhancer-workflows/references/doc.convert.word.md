READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `doc.convert.word` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `doc.convert.word`

- Primary when: Word source/output: Add-on to matching prose; Primary only for Word conversion or structure work.
- Reference steps:
  1. [step-1] Inspect source and target format.
  2. [step-2] Confirm output location and preservation needs.
  3. [step-3] Create or convert.
  4. [step-4] Review headings, tables, figures, and document structure.
  5. [step-audit] When no composed language checker owns the independent audit, reviewer audits the format output against preservation, structure, and compile or render evidence; a composed writer/checker Primary keeps its sequence unchanged
- Agent candidates: `task`, `reviewer`.
- Delegated checkpoints:
  - step-3: task owns only a bounded format conversion and document-structure preservation slice; for prose changes, prefer the writer from the composed writing.zh or writing.en workflow
  - step-4: prefer the composed language checker for revised prose; task may return bounded structure evidence, while the parent reconciles document scope and visual review
  - step-audit: reviewer audits the format output when no composed language checker owns the independent audit; composed writer/checker sequences stay unchanged
- Quality checks:
  - source fidelity, target readability, output existence, and overwrite awareness
- Scope notes:
  - Source preservation and overwrite risk deserve explicit attention.
- Risk notes:
  - Confirm the intended output path before replacing an existing document.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. An audit checkpoint named by this card is delegated by default and falls back only when the named audit Agent is unavailable; the recorded fallback names that unavailability. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition. ORCHESTRATOR: Main is the orchestrator. Evidence gathering, planning, implementation, and audit checkpoints are delegated to the Agents named by the loaded card; Main keeps selection, TODO, assignment copy, delivery integration, permission and external-effect decisions, and the final response. Direct work exists only on DIRECT, on `agentic.simple`, or behind a concrete recorded fallback. Main never self-induces a fallback by skipping brief, input, or checkpoint preparation; a fallback= row names exactly one enumerated reason and the affected checkpoint.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.
ORCHESTRATOR: Main is the orchestrator. Evidence gathering, planning, implementation, and audit checkpoints are delegated to the Agents named by the loaded card; Main keeps selection, TODO, assignment copy, delivery integration, permission and external-effect decisions, and the final response. Direct work exists only on DIRECT, on `agentic.simple`, or behind a concrete recorded fallback. Main never self-induces a fallback by skipping brief, input, or checkpoint preparation; a fallback= row names exactly one enumerated reason and the affected checkpoint.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.