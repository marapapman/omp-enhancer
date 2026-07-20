READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `release.opensource` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `release.opensource`

- Primary when: The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area.
- Reference steps:
  1. [step-1] Confirm the exact source, a distinct staging target, intended public scope, excluded assets and history, license decision, secret and PII policy, required packaging, and whether publication is explicitly out of scope or separately authorized.
  2. [step-2] Create or refresh only the authorized staging copy, excluding source history and generated or private artifacts, parameterizing sensitive configuration, and recording every transformation without modifying the source project.
  3. [step-3] Run an independent read-only sanitization review of the staged revision for secrets, credentials, PII, internal references, dangerous files, configuration completeness, and retained history, returning evidence inline.
  4. [step-4] After the parent accepts a clean or explicitly qualified sanitization result, add only the authorized README, setup, license, contribution, configuration, and issue-template packaging to staging.
  5. [step-5] Run project-appropriate tests and package checks inside staging without using publication as a verification step.
  6. [step-6] Re-scan the final staged revision after packaging and independently review the source-to-staging diff, sanitization evidence, license, documentation, tests, and remaining public-release risk.
  7. [step-7] Deliver the staging path, transformation ledger, sanitization verdict, test evidence, limitations, and review findings; apply release.publish only when it was selected in PLAN for an explicitly authorized public target.
- Agent candidates: `ecc-opensource-forker`, `ecc-opensource-sanitizer`, `ecc-opensource-packager`, `reviewer`.
- Delegated checkpoints:
  - step-2: ecc-opensource-forker owns only the authorized source-to-staging transformation and inline transformation ledger
  - step-3: ecc-opensource-sanitizer independently scans the staged revision read-only and returns sanitization evidence inline
  - step-4: ecc-opensource-packager owns only the authorized public packaging files inside staging
  - step-6: ecc-opensource-sanitizer independently re-scans the final packaged revision read-only
  - step-6: reviewer independently audits the source-to-staging diff, sanitization, license, documentation, tests, and release boundary
  - step-7: the parent reconciles all evidence and retains exclusive ownership of any separately authorized publish action
- Quality checks:
  - source and staging separation, complete transformation ledger, no exposed secret or PII, current final-revision sanitization evidence, license and documentation correspondence, clean package and test evidence, independent diff review, explicit limitations, and separate publish authorization
- Scope notes:
  - The forker and packager may write only inside the confirmed staging target; the sanitizer and reviewer remain read-only.
  - Sanitization findings return inline and never require a report file in the staged project.
  - No Agent owns publication; the parent may publish only through an explicitly composed release.publish workflow.
- Risk notes:
  - Public release can expose secrets, PII, proprietary history, licenses, or internal infrastructure; a sanitized staging candidate is not permission to publish.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.