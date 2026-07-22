---
name: omp-enhancer-workflows
description: Workflow index for staged project work.
---

DECLARE HANDOFF (soft): Next visible response MUST start byte 0 with `WORKFLOW PLAN` and contain only this form plus resource calls. Select internally; state stays silent; no project path; user text suffices:
WORKFLOW PLAN
Primary: <id-or-none>
Add-ons: <ids-or-none>
Skills: <exact domain Skill/catalog URIs-or-none>
Load order: NOW=[<chosen non-supplied Skill/catalog URIs-or-none>] THEN=[<Add-on PLAN URIs; Primary PLAN URI last-or-none>]
Actions:
1. LOAD: <NOW, revealed extensions, THEN, and waits>
2. COMMIT: After all resources, emit READY + detailed TODO from loaded steps only; end and wait; zero project tools.
3. SPLIT + EXECUTE: After READY wait, apply loaded defaults/checkpoints to current Agents and dependency order; Delegate or record one permitted fallback.
4. VERIFY: <requested acceptance evidence and parent delivery integration>
PLAN text alone is incomplete: same response calls NOW and waits, or calls THEN if NOW=none. THEN is one final resource-only batch. Give each evidence checkpoint an Action.
AFTER NOW: empty revealed URI set => no text/marker; call the THEN batch. Otherwise RESOURCE EXTENSION MUST list >=1 exact revealed URI; `reads=none` is invalid.

Catalog version: 22.

Navigation only: never routes, gates, grants permission, selects Agents, or decides completion.

## Staged protocol

STATE: DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY.

1. **DISCOVER** — This body is the completed DISCOVER result; do not read `skill://omp-enhancer-workflows` again. A verbatim field lookup needs no Skill or TODO.

2. **DECLARE + LOAD** — Choose by operation, source, and output. Emit PLAN first; load NOW, wait, then load THEN and wait. Project tools start only after the READY + TODO response ends and its results return.

3. **COMMIT + EXECUTE** — Emit READY first; commit loaded methods to detailed native TODO, wait, then split, execute, and verify.

Main owns delegation; OMP owns tools, permissions, TODO, Agents, and completion.

PROSE: English draft/revision -> `writing.en`; Chinese -> `writing.zh`; unknown body -> `writing.pending`. Other central operation => language Add-on. Language Primary + `.tex` target/LaTeX prose/preserved LaTeX commands => `writing.latex` Add-on. Direct standalone SVG -> `diagram.svg`; editable TikZ `.tex`/PDF/SVG/PNG -> `diagram.tikz`; TikZ source alone does not add `writing.latex`. Format-only => format Primary. Converters/templates only when requested. Loaded language card + target/constraints/roles => writer -> checker -> parent VERIFY after READY; Main does not pre-read.
VISUAL: Non-visual Primary + independently requested UI/layout/static-visual deliverable => `design.visual` Add-on. Standalone slide/SVG/TikZ stays specialized Primary; add `design.visual` only for separate visual-design work/output.

## Domain index

SKILL DISCOVERY: `D` and `C` are optional candidates, never load sets. Select only a URI that matches the requested method, evidence rule, verdict, or format. An enumerated `C` URI goes directly in PLAN/NOW. `skill://ecc-skill-catalog` remains only for unlisted niche discovery; refs stay in THEN.

### general

- `agentic.simple` — Only for trivial one-step operations: a simple command execution, a one-line code/text change, a direct factual answer, or a single read-only lookup needing no analysis, investigation, or subagent work. S=[none]. PLAN URI: `skill://omp-enhancer-workflows/references/agentic.simple.md`.

### writing

#### language

- `writing.pending` — Temporary Primary when a named writing target's body language is unknown; after one narrow language read, replace once with writing.zh or writing.en before substantive work. S=[none]. PLAN URI: `skill://omp-enhancer-workflows/references/writing.pending.md`.
- `writing.zh` — The prose being drafted or revised is Chinese, regardless of the instruction language. D=[`skill://plain-chinese-writing`, `skill://zh-writing-review`]. PLAN URI: `skill://omp-enhancer-workflows/references/writing.zh.md`.
- `writing.en` — The prose being drafted or revised is English, regardless of the instruction language. D=[`skill://writing-review`]. PLAN URI: `skill://omp-enhancer-workflows/references/writing.en.md`.

#### format overlays

- `writing.latex` — LaTeX source/output, LaTeX prose, or preserved commands: Add-on to matching prose; Primary only for format/structure work. A preservation-only Add-on selects zero format Skills; explicit conversion or template selects one matching candidate. D=[`skill://format-markdown2latex`, `skill://format-latex2markdown`, `skill://format-template-latex`]. PLAN URI: `skill://omp-enhancer-workflows/references/writing.latex.md`.
- `writing.markdown` — Markdown source/output: Add-on to matching prose; Primary only for Markdown conversion or structure work. D=[`skill://writing-markdown-helper`, `skill://zh-writing-markdown-helper`]. PLAN URI: `skill://omp-enhancer-workflows/references/writing.markdown.md`.
- `doc.convert.word` — Word source/output: Add-on to matching prose; Primary only for Word conversion or structure work. D=[`skill://docx`]. PLAN URI: `skill://omp-enhancer-workflows/references/doc.convert.word.md`.

#### specialized outputs

- `slides.generate` — New LaTeX Beamer deck requiring template/story decisions before frame authoring. D=[`skill://latex-beamer-slides`, `skill://slides-storyline`, `skill://beamer-to-powerpoint`]. PLAN URI: `skill://omp-enhancer-workflows/references/slides.generate.md`.
- `slides.modify` — Bounded wording, language, or existing-style changes to a current LaTeX Beamer deck. D=[`skill://latex-beamer-slides`]. PLAN URI: `skill://omp-enhancer-workflows/references/slides.modify.md`.
- `diagram.svg` — Standalone monochrome SVG workflow/process/block/box diagram with rendered visual QA. D=[`skill://svg-flowchart`]. PLAN URI: `skill://omp-enhancer-workflows/references/diagram.svg.md`.
- `diagram.tikz` — Editable TikZ paper diagram with PDF/SVG/PNG evidence. D=[`skill://tikz-diagram`]. PLAN URI: `skill://omp-enhancer-workflows/references/diagram.tikz.md`.

### research

- `research.web` — A current source-backed synthesis, comparison, recommendation, or research report requires live web search; add factcheck.document only when claim verdicts are also requested. D=[`skill://fact-checking`, `skill://claim-extraction`, `skill://source-evaluation`, `skill://citation-authenticity`] C=[`skill://ecc-skill-catalog/research-ops/SKILL.md`, `skill://ecc-skill-catalog/deep-research/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/research.web.md`.
- `factcheck.document` — A claim-by-claim verdict is requested for existing statements, citations, freshness, or support; add research.web only when live evidence collection is also requested. D=[`skill://fact-checking`]. PLAN URI: `skill://omp-enhancer-workflows/references/factcheck.document.md`.

### code

- `code.dev` — Substantive code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, or review when no OMP plugin, database, ML, network, writing, research, design, or release card better owns the central deliverable. D=[`skill://code-development`]. PLAN URI: `skill://omp-enhancer-workflows/references/code.dev.md`.

### network

- `network.design` — A new or substantially changed enterprise, multi-site, cloud-connected, or segmented network architecture needs an implementation plan, not immediate device mutation. C=[`skill://ecc-skill-catalog/network-config-validation/SKILL.md`, `skill://ecc-skill-catalog/safety-guard/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/network.design.md`.
- `network.homelab` — A home or small-lab network plan covers gateways, switching, Wi-Fi, local services, segmentation, DNS, or remote access. C=[`skill://ecc-skill-catalog/homelab-network-readiness/SKILL.md`, `skill://ecc-skill-catalog/homelab-network-setup/SKILL.md`, `skill://ecc-skill-catalog/homelab-pihole-dns/SKILL.md`, `skill://ecc-skill-catalog/homelab-vlan-segmentation/SKILL.md`, `skill://ecc-skill-catalog/homelab-wireguard-vpn/SKILL.md`, `skill://ecc-skill-catalog/safety-guard/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/network.homelab.md`.
- `network.review` — The user asks for a read-only review of router, switch, firewall, VPN, DNS, DHCP, routing, ACL, or management-plane configuration. C=[`skill://ecc-skill-catalog/network-config-validation/SKILL.md`, `skill://ecc-skill-catalog/safety-guard/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/network.review.md`.
- `network.debug` — The task is to diagnose a concrete connectivity, routing, DNS, interface, BGP, firewall, policy, or management symptom using read-only evidence. C=[`skill://ecc-skill-catalog/network-interface-health/SKILL.md`, `skill://ecc-skill-catalog/network-bgp-diagnostics/SKILL.md`, `skill://ecc-skill-catalog/netmiko-ssh-automation/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/network.debug.md`.

### database

- `database.review` — A read-only review of database schema, SQL, indexes, transactions, locks, permissions, or a migration plan. D=[`skill://code-development`] C=[`skill://ecc-skill-catalog/postgres-patterns/SKILL.md`, `skill://ecc-skill-catalog/mysql-patterns/SKILL.md`, `skill://ecc-skill-catalog/database-migrations/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/database.review.md`.
- `database.change` — An authorized schema, query, index, constraint, data-migration, or database-config change needs verification. D=[`skill://code-development`] C=[`skill://ecc-skill-catalog/database-migrations/SKILL.md`, `skill://ecc-skill-catalog/postgres-patterns/SKILL.md`, `skill://ecc-skill-catalog/mysql-patterns/SKILL.md`, `skill://ecc-skill-catalog/safety-guard/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/database.change.md`.
- `database.migration.repair` — A migration failed, diverged, or was partly applied, and the user wants diagnosis and an authorized repair. D=[`skill://code-development`] C=[`skill://ecc-skill-catalog/database-migrations/SKILL.md`, `skill://ecc-skill-catalog/postgres-patterns/SKILL.md`, `skill://ecc-skill-catalog/mysql-patterns/SKILL.md`, `skill://ecc-skill-catalog/safety-guard/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/database.migration.repair.md`.

### ml

- `ml.review` — A read-only review of a production ML data, training, evaluation, artifact, inference, serving, monitoring, or rollback path. D=[`skill://code-development`] C=[`skill://ecc-skill-catalog/mle-workflow/SKILL.md`, `skill://ecc-skill-catalog/pytorch-patterns/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/ml.review.md`.
- `ml.debug` — A training, evaluation, model, tensor, device, data-loader, artifact, batch, or online-inference failure needs diagnosis or an authorized fix. D=[`skill://code-development`] C=[`skill://ecc-skill-catalog/mle-workflow/SKILL.md`, `skill://ecc-skill-catalog/pytorch-patterns/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/ml.debug.md`.

### growth

- `marketing.campaign` — An evidence-backed multi-channel campaign plan or content is requested for a defined product, audience, positioning, claims, and language. C=[`skill://ecc-skill-catalog/marketing-campaign/SKILL.md`, `skill://ecc-skill-catalog/market-research/SKILL.md`, `skill://ecc-skill-catalog/brand-voice/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/marketing.campaign.md`.
- `seo.audit` — An evidence-backed technical, on-page, structured-data, performance, or content-intent SEO audit is requested without implicit remediation. C=[`skill://ecc-skill-catalog/seo/SKILL.md`, `skill://ecc-skill-catalog/benchmark/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/seo.audit.md`.

### operations

- `general.subagent` — Non-trivial analysis, investigation, multi-step modification, or creation when no specialized domain workflow adds a material method, evidence rule, risk control, or output constraint. S=[none]. PLAN URI: `skill://omp-enhancer-workflows/references/general.subagent.md`.
- `omp.plugin` — The target is an OMP plugin, the omp-enhancer monorepo, or an isolated self-development fixture: workflows, Skills, Agents, prompts, reminders, hooks, config assets, packaging, or E2E. D=[`skill://code-development`]. PLAN URI: `skill://omp-enhancer-workflows/references/omp.plugin.md`.
- `security.review` — The task explicitly reviews security trust boundaries, vulnerability impact, or remediation. C=[`skill://ecc-skill-catalog/security-review/SKILL.md`, `skill://ecc-skill-catalog/security-scan/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/security.review.md`.
- `design.visual` — Independent UI/layout/interaction/static visual work/output. D=[`skill://frontend-design`, `skill://canvas-design`]. PLAN URI: `skill://omp-enhancer-workflows/references/design.visual.md`.
- `release.opensource` — The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area. D=[`skill://code-development`] C=[`skill://ecc-skill-catalog/opensource-pipeline/SKILL.md`, `skill://ecc-skill-catalog/safety-guard/SKILL.md`]. PLAN URI: `skill://omp-enhancer-workflows/references/release.opensource.md`.
- `release.publish` — The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact. D=[`skill://conventional-commits`, `skill://finishing-a-development-branch`]. PLAN URI: `skill://omp-enhancer-workflows/references/release.publish.md`.

## State handoff

SELECTION: Primary = central deliverable; independent requested operations/outputs = Add-ons. Skills own methods/evidence/format; refs do not.

EXECUTION: DIRECT skips; `agentic.simple` has no `task`; `writing.pending` composes once; other cards use the compiler.

FALLBACK: concrete user/native, Agent/capacity, input/dependency/write-set, safety, or parent ownership only; never size, latency, read-only, overhead, or no delegation request.

SKILL URI: D=direct; C=exact nested; others need a loaded source. Supplied bodies stay in PLAN/READY, not NOW; only exact failure marks unavailable.

LOAD: Skills=exact domain Skill/catalog URIs; NOW=non-supplied Skills/catalogs; THEN=Add-on refs then Primary. Load/wait each; max 2 catalog + 1 method extensions. NOW none loads THEN with PLAN. Never guess/reread/re-PLAN except `writing.pending`.

COMMIT HANDOFF (soft): after every declared NOW resource, revealed extension, and THEN reference has returned or been marked unavailable, next response begins `W`, fills `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>` with bare IDs, initializes native TODO only, and ends/waits. Freeze W/S. COMPILE (soft): loaded `subagent-driven` + complete input + safe checkpoint + visible matching Agent => Delegate row; otherwise `fallback=<one matched permitted limitation>`. Project tools start only after the READY + TODO response ends and its results return.

NEXT VISIBLE BYTES MUST BE `WORKFLOW PLAN`; no preface; no plugin enforces this format.
