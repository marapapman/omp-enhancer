---
name: omp-enhancer-workflows
description: Workflow navigation for analysis, judgment, staged work, or delegation.
---

# OMP Enhancer workflows

Catalog version: 18.

This Skill is navigation, not a domain method. It does not route tasks, select Agents, create gates, change tools, grant permission, or decide completion.

## Staged protocol

1. **DISCOVER** — For non-mechanical work, read this index alone before project work and wait. A mechanical field lookup without analysis uses no Skill or TODO.

2. **PLAN + LOAD** — Choose from the requested operation, source, and output. Emit the exact block below, load only its resources, and wait; project facts wait until READY.

3. **READY + EXECUTE** — After resources, emit READY, commit the loaded method to detailed native TODO when exposed, wait, then execute it.

Delegation is Main-owned; OMP native settings, tools, permissions, TODO, dynamic Agents, and completion remain authoritative.

WORKFLOW MATCH: test every whole Primary condition, not words like plan. Choose one for the central requested operation or deliverable; put every other independently matching requested operation or output in Add-ons. Do not add a workflow merely for an internal phase already covered by the Primary. Format-conversion plans match source/output rows, not `code.dev`. LaTeX prose correction keeps `writing.latex` + its language workflow; no converter/template unless requested.

## Domain index

SELECTION TABLE ONLY: choose here, emit PLAN, then read its literal PLAN URIs. A PLAN URI is `Load order` text, not an early call. Choose Skills from native descriptions and `Not for` boundaries, never for awareness.

### general

- `agentic.simple` — Primary: Only after checking the specialized cards and finding that none adds a material method, evidence, preservation, risk, format, or delegation contract; a small or focused target alone does not qualify. PLAN URI: `skill://omp-enhancer-workflows/references/agentic.simple.md`.

### writing

- `writing.pending` — Primary: Temporary Primary only when a named writing target has not been observed and its prose language is unknown; after one narrow source read, replace it with writing.zh or writing.en before substantive review or revision. PLAN URI: `skill://omp-enhancer-workflows/references/writing.pending.md`.
- `writing.zh` — Primary: The prose being drafted or revised is Chinese, regardless of the instruction language. PLAN URI: `skill://omp-enhancer-workflows/references/writing.zh.md`.
- `writing.en` — Primary: The prose being drafted or revised is English, regardless of the instruction language. PLAN URI: `skill://omp-enhancer-workflows/references/writing.en.md`.
- `writing.latex` — Primary: A requested writing, revision, or conversion source/output is LaTeX; compose with another matching format or prose workflow. PLAN URI: `skill://omp-enhancer-workflows/references/writing.latex.md`.
- `slides.generate` — Primary: The user wants a new LaTeX Beamer deck, with template and story decisions completed before frame authoring. PLAN URI: `skill://omp-enhancer-workflows/references/slides.generate.md`.
- `slides.modify` — Primary: The user wants bounded wording, language, or existing-style changes to a current LaTeX Beamer deck. PLAN URI: `skill://omp-enhancer-workflows/references/slides.modify.md`.
- `diagram.svg` — Primary: The user wants a standalone SVG workflow, process, block, or box diagram with strict monochrome geometry and rendered visual QA. PLAN URI: `skill://omp-enhancer-workflows/references/diagram.svg.md`.
- `writing.markdown` — Primary: A requested writing, revision, or conversion source/output is Markdown; compose with another matching format or prose workflow. PLAN URI: `skill://omp-enhancer-workflows/references/writing.markdown.md`.
- `doc.convert.word` — Primary: The requested output is a Word document or a conversion to or from Word. PLAN URI: `skill://omp-enhancer-workflows/references/doc.convert.word.md`.

### research

- `research.web` — Primary: The final deliverable is a current, source-backed synthesis, comparison, recommendation, or research report that requires live web search; use factcheck.document as an Add-on when material claims also need verdicts. PLAN URI: `skill://omp-enhancer-workflows/references/research.web.md`.
- `factcheck.document` — Primary: The final deliverable is a claim-by-claim verdict on existing statements, citations, freshness, or source support; add research.web only when live evidence collection is also required. PLAN URI: `skill://omp-enhancer-workflows/references/factcheck.document.md`.

### code

- `code.dev` — Primary: The central task is substantive software work outside the complete OMP plugin or OMP Enhancer self-development condition: inspect or plan a codebase, diagnose or debug a failure, implement or refactor behavior, author or run tests, repair a build, measure performance, or review code or a diff. The requested scope determines whether work is read-only or may mutate files. PLAN URI: `skill://omp-enhancer-workflows/references/code.dev.md`.

### network

- `network.design` — Primary: The user wants a new or substantially changed enterprise, multi-site, cloud-connected, or segmented network architecture and an implementation plan rather than immediate device mutation. PLAN URI: `skill://omp-enhancer-workflows/references/network.design.md`.
- `network.homelab` — Primary: The user wants a safe home or small-lab network plan involving gateways, switches, access points, local services, segmentation, DNS, or remote access. PLAN URI: `skill://omp-enhancer-workflows/references/network.homelab.md`.
- `network.review` — Primary: The user asks for a read-only review of router, switch, firewall, VPN, DNS, DHCP, routing, ACL, or management-plane configuration. PLAN URI: `skill://omp-enhancer-workflows/references/network.review.md`.
- `network.debug` — Primary: The task is to diagnose a concrete connectivity, routing, DNS, interface, BGP, firewall, policy, or management symptom using read-only evidence. PLAN URI: `skill://omp-enhancer-workflows/references/network.debug.md`.

### database

- `database.review` — Primary: The user asks for a read-only review of database schema, SQL, indexes, transactions, locks, permissions, or a migration plan. PLAN URI: `skill://omp-enhancer-workflows/references/database.review.md`.
- `database.change` — Primary: The user authorizes a schema, query, index, constraint, data-migration, or database-configuration change with verification. PLAN URI: `skill://omp-enhancer-workflows/references/database.change.md`.
- `database.migration.repair` — Primary: A database migration failed, diverged, partially applied, or left environments at inconsistent states and the user wants diagnosis and an authorized repair. PLAN URI: `skill://omp-enhancer-workflows/references/database.migration.repair.md`.

### ml

- `ml.review` — Primary: The user asks for a read-only review of a production machine-learning data, training, evaluation, artifact, inference, serving, monitoring, or rollback path. PLAN URI: `skill://omp-enhancer-workflows/references/ml.review.md`.
- `ml.debug` — Primary: A training, evaluation, model loading, tensor, device, gradient, data loader, artifact, batch inference, or online inference path fails and the user wants diagnosis or an authorized fix. PLAN URI: `skill://omp-enhancer-workflows/references/ml.debug.md`.

### growth

- `marketing.campaign` — Primary: The user wants an evidence-backed multi-channel campaign plan or campaign content tied to a product, audience, positioning, claims, language, and review process. PLAN URI: `skill://omp-enhancer-workflows/references/marketing.campaign.md`.
- `seo.audit` — Primary: The user wants an evidence-backed technical, on-page, structured-data, performance, or content-intent SEO audit without implicit remediation or publication. PLAN URI: `skill://omp-enhancer-workflows/references/seo.audit.md`.

### operations

- `omp.plugin` — Primary: The target is an OMP plugin, the omp-enhancer monorepo, or an isolated OMP Enhancer self-development fixture, including a workflow, Skill, Agent, prompt, reminder, hook, config asset, packaging path, or E2E harness. PLAN URI: `skill://omp-enhancer-workflows/references/omp.plugin.md`.
- `security.review` — Primary: The task explicitly reviews security trust boundaries, vulnerability impact, or remediation. PLAN URI: `skill://omp-enhancer-workflows/references/security.review.md`.
- `design.visual` — Primary: The requested output is a UI, visual asset, diagram, layout, or interaction design. PLAN URI: `skill://omp-enhancer-workflows/references/design.visual.md`.
- `release.opensource` — Primary: The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area. PLAN URI: `skill://omp-enhancer-workflows/references/release.opensource.md`.
- `release.publish` — Primary: The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact. PLAN URI: `skill://omp-enhancer-workflows/references/release.publish.md`.

## State handoff

SOFT, MAIN-OWNED TRACE: no plugin enforces this order. Only visible assistant text counts; thinking, tool arguments, and files do not.

SELECTION: Primary is exactly one central workflow ID. Put every other independently matching operation or output in Add-ons, never joined with `+`. From the native inventory, exclude every `Not for` match and choose the smallest Skill set positively owning the requested method, evidence, verdict, or format, never one for awareness. Format-only conversion loads its converter, not a target-format prose Skill unless content editing is requested. A workflow reference is not a domain Skill.

LOAD ORDER: list every declared exact domain Skill or catalog `skill://...` URI first, then copy each selected row's literal workflow `PLAN URI:` once and last. This makes the final card cue READY. Resolve an exact nested Skill URI revealed by a declared catalog before the workflow references; name it, read it, wait, and do not repeat PLAN.

NEXT VISIBLE ASSISTANT TEXT — plain, unquoted, fully filled before any tool call:
WORKFLOW PLAN
Primary: <one-workflow-id-or-none>
Add-ons: <comma-separated-workflow-ids-or-none>
Skills: <comma-separated-exact-domain-skill-uris-or-none>
Load order: <comma-separated-skill-then-reference-uris-or-none>
Actions:
1. <how every selected workflow and Skill will be applied and verified>
OUTPUT BRIDGE: the first visible content item is this full `WORKFLOW PLAN`; resource calls follow it. Use a separate numbered Action for each distinct requested checkpoint or evidence phase; do not collapse them into one catch-all line. Thinking, narration without the block, or `...` does not count. Call every Load order URI and nothing else, end, and wait; no project tool, `todo`, `task`, or final.

AFTER ALL DECLARED RESOURCES AND ANY CATALOG EXTENSION HAVE RETURNED, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`; then rebase the detailed TODO once before the first project action. When native `todo` is exposed, the only call in this response is TODO init; end and wait, then start project work in the next response.
