READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `writing.latex` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `writing.latex`

- Primary when: LaTeX source/output, LaTeX prose, or preserved commands: Add-on to matching prose; Primary only for format/structure work. A preservation-only Add-on selects zero format Skills; explicit conversion or template selects one matching candidate.
- Reference steps:
  1. [step-1] The owning workflow checkpoint actor reads the relevant source and local macros; when composed with a language workflow, the language writer owns the prose target read.
  2. [step-2] Preserve commands, comments, citations, math, labels, and revision markers.
  3. [step-3] Make only the requested format conversion or LaTeX-structure change; a composed language writer owns prose revision.
  4. [step-4] Use a language-neutral task only for bounded compile evidence; the composed language checker owns semantic review.
- Agent candidates: `task`.
- Delegated checkpoints:
  - step-3: task owns only an explicitly requested format-only conversion or LaTeX-structure change; the writer selected from composed writing.zh or writing.en owns every prose revision checkpoint
  - step-4: task may return only explicitly requested compile evidence; the selected composed language checker owns every semantic-check checkpoint, while the parent reconciles structure and scope
- Quality checks:
  - LaTeX structure, active-text boundaries, reference integrity, and compile evidence when requested
- Scope notes:
  - Compilation and publication are separate workflow steps when requested.
  - A TikZ figure source alone selects diagram.tikz, not writing.latex; compose this card only for an independently requested LaTeX prose, document-format, template, or structure operation.
  - When composed with writing.en or writing.zh as a preservation-only Add-on, it contributes LaTeX preservation constraints only: select zero format Skills and create no generic `task` Delegate row.
  - Its generic `task` candidate is only for an explicitly requested format conversion, LaTeX-structure change, or compile-evidence checkpoint; it is not a candidate for prose revision or semantic check when a language workflow is composed.
- Risk notes:
  - none

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.