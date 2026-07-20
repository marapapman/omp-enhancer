READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `marketing.campaign` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `marketing.campaign`

- Primary when: An evidence-backed multi-channel campaign plan or content is requested for a defined product, audience, positioning, claims, and language.
- Reference steps:
  1. [step-1] Confirm the product, audience, decision, geography, channels, campaign stage, budget, timeline, output language, factual claims, deliverables, and publication boundary.
  2. [step-2] Apply research.web and factcheck.document only when they were selected in PLAN for live evidence or claim verdicts, and record the distinction between fact and positioning inference.
  3. [step-3] Define the source-backed audience insight, positioning, campaign angle, core benefit, message hierarchy, brand voice, channel purpose, and claim ledger before drafting copy.
  4. [step-4] Apply the PLAN-selected writing.zh or writing.en method for the requested output language and create only the authorized channel deliverables.
  5. [step-5] Check claim support, source freshness, language quality, channel fit, CTA correspondence, cross-channel consistency, accessibility, and visual needs before delivery.
  6. [step-6] Deliver the bounded campaign artifacts, evidence and assumption notes, unresolved claim limitations, and explicit next actions without publishing them unless separately authorized.
- Agent candidates: `task`.
- Delegated checkpoints:
  - steps-1-3: keep campaign scope, positioning, claim boundaries, and workflow composition with the parent
  - steps-2-5: task owns one complete bounded channel deliverable and evidence slice only when no composed domain Agent is a closer match; a composed domain Agent is preferred when its workflow owns the requested research, fact-check, prose, slide, or visual method
  - step-6: the parent reconciles facts, language, channel scope, artifacts, and publication boundaries
- Quality checks:
  - audience and product correspondence, fact and claim evidence, explicit inference, selected output language, language-matched writing review, channel-specific purpose, cross-channel consistency, supportable CTA, publication boundary, and residual uncertainty
- Scope notes:
  - The workflow owns campaign structure; task may own a complete bounded channel slice, but prefer exact domain roles inherited from the selected research, fact-check, writing, slide, or visual workflow.
  - Content creation is not permission to send email, post to social platforms, buy ads, or publish a site.
- Risk notes:
  - Unsupported claims, fabricated urgency, privacy-sensitive targeting, and unapproved publication can create legal and reputational harm.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.