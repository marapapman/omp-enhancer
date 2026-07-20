READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `release.publish` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `release.publish`

- Primary when: The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.
- Reference steps:
  1. [step-1] Confirm the requested target and release scope.
  2. [step-2] Run relevant preflight checks.
  3. [step-3] Perform the requested mutation once.
  4. [step-4] Independently verify the remote or installed result.
  5. [step-5] Report the exact released state.
- Agent candidates: `task`.
- Delegated checkpoints:
  - step-2: task owns a bounded read-only preflight slice and returns exact evidence without changing release state
  - step-3: Main retains exclusive ownership of the user-authorized release mutation and performs it once through host-authorized tools
  - step-4: task owns a bounded read-only post-mutation verification slice for the exact remote, marketplace, deployed, or installed state
  - step-5: the parent reconciles the verified target and reports the exact final state
- Quality checks:
  - target and version correspondence, successful preflight, independent post-mutation verification, and exact final state
- Scope notes:
  - A plan or dry run is not a completed release.
  - Do not infer a different repository, package, ref, environment, or install target.
- Risk notes:
  - Use host approval and the user-authorized target for irreversible or externally visible actions.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.