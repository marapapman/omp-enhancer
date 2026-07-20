READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `seo.audit` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `seo.audit`

- Primary when: An evidence-backed technical, on-page, structured-data, performance, or content-intent SEO audit is requested without implicit remediation.
- Reference steps:
  1. [step-1] Confirm the site and revision, target market and language, important URLs, search intent, analytics and search-console evidence available, crawl boundary, and requested audit depth.
  2. [step-2] Collect current crawl, indexability, canonical, redirect, sitemap, robots, metadata, heading, internal-link, structured-data, mobile render, and performance evidence from authorized sources.
  3. [step-3] Map each finding to a concrete URL, source or render artifact, observed behavior, affected search or user intent, severity, and reproducible validation.
  4. [step-4] Separate demonstrated technical defects from content hypotheses, keyword opportunities, third-party estimates, and recommendations that require live experiments.
  5. [step-5] Deliver a prioritized audit with crawl and index evidence, current render and performance limitations, safe remediation order, and the workflows required for authorized code or prose changes.
- Agent candidates: `task`.
- Delegated checkpoints:
  - steps-1-4: task owns one complete bounded URL and evidence slice only when no composed domain Agent is a closer match; a composed domain Agent is preferred when its workflow owns the requested research, prose, or visual method
  - step-5: the parent reconciles crawl, index, render, performance, language, and evidence limitations
- Quality checks:
  - crawl boundary, index and canonical evidence, URL-to-finding correspondence, current render evidence, structured-data correspondence, measured performance evidence, language and search-intent fit, prioritization rationale, and explicit limitations
- Scope notes:
  - Main owns audit scope and final synthesis; task may own a complete bounded URL slice, but prefer exact domain roles from composed research, writing, or visual workflows when they match.
  - SEO recommendations do not authorize site edits, deployment, analytics changes, outreach, or publication.
- Risk notes:
  - Search-engine behavior and third-party metrics change over time; label estimates and retrieve current primary evidence where material.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.