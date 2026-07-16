---
name: omp-enhancer-workflows
description: Optional OMP Enhancer workflow reference. Use when a task benefits from a domain checklist or composable workflow card; OMP native settings, tools, permissions, TODO behavior, and dynamic Agents always remain authoritative.
---

# OMP Enhancer workflows

Catalog version: 12.

This skill provides optional reference information. It does not route the task, select an Agent, require TODO or delegation, change active tools, grant permission, or decide when work is complete.

Use OMP's current system prompt and runtime settings first. Select, combine, simplify, or ignore the cards below. If more detail is useful, read only the relevant domain reference.

## Domain index

### general

Reference: `references/general.md`

- `agentic.simple`: The request is focused and does not benefit from a specialized workflow.

### writing

Reference: `references/writing.md`

- `writing.pending`: A writing task names a target but the text being changed has not been observed yet.
- `writing.zh`: The prose being drafted or revised is Chinese, regardless of the instruction language.
- `writing.en`: The prose being drafted or revised is English, regardless of the instruction language.
- `writing.latex`: The target artifact is LaTeX; compose this format workflow with the prose language workflow.
- `slides.generate`: The user wants a new LaTeX Beamer deck, with template and story decisions completed before frame authoring.
- `slides.modify`: The user wants bounded wording, language, or existing-style changes to a current LaTeX Beamer deck.
- `diagram.svg`: The user wants a standalone SVG workflow, process, block, or box diagram with strict monochrome geometry and rendered visual QA.
- `writing.markdown`: The target artifact is Markdown; compose this format workflow with the prose language workflow.
- `doc.convert.word`: The requested output is a Word document or a conversion to or from Word.

### research

Reference: `references/research.md`

- `research.web`: The user wants current, evidence-backed research that requires live web search, reliable source selection, synthesis, and explicit fact checking.
- `factcheck.document`: The user asks to verify factual claims, citations, freshness, or source support.
- `research.technical`: The task asks how a concrete library, framework, protocol, API, or installed dependency behaves at a specific version and needs source-backed technical evidence.

### code

Reference: `references/code.md`

- `code.plan`: The deliverable is an implementation, repair, migration, or test plan rather than the change itself.
- `code.dev`: The user authorizes a code or configuration change, usually with verification.
- `code.debug`: The task is to reproduce, localize, or explain a concrete failure or mismatch.
- `code.test`: The task requires designing, adding, running, or interpreting tests.
- `code.review`: The user asks for a read-only code review, bug audit, regression audit, or diff review.
- `code.build`: A compiler, type checker, linker, bundler, package, or build command fails and the user wants diagnosis or an authorized repair.
- `performance.optimize`: The user wants a measured performance improvement with a preserved correctness contract rather than an unmeasured cleanup.

### network

Reference: `references/network.md`

- `network.design`: The user wants a new or substantially changed enterprise, multi-site, cloud-connected, or segmented network architecture and an implementation plan rather than immediate device mutation.
- `network.homelab`: The user wants a safe home or small-lab network plan involving gateways, switches, access points, local services, segmentation, DNS, or remote access.
- `network.review`: The user asks for a read-only review of router, switch, firewall, VPN, DNS, DHCP, routing, ACL, or management-plane configuration.
- `network.debug`: The task is to diagnose a concrete connectivity, routing, DNS, interface, BGP, firewall, policy, or management symptom using read-only evidence.

### database

Reference: `references/database.md`

- `database.review`: The user asks for a read-only review of database schema, SQL, indexes, transactions, locks, permissions, or a migration plan.
- `database.change`: The user authorizes a schema, query, index, constraint, data-migration, or database-configuration change with verification.
- `database.migration.repair`: A database migration failed, diverged, partially applied, or left environments at inconsistent states and the user wants diagnosis and an authorized repair.

### ml

Reference: `references/ml.md`

- `ml.review`: The user asks for a read-only review of a production machine-learning data, training, evaluation, artifact, inference, serving, monitoring, or rollback path.
- `ml.debug`: A training, evaluation, model loading, tensor, device, gradient, data loader, artifact, batch inference, or online inference path fails and the user wants diagnosis or an authorized fix.

### growth

Reference: `references/growth.md`

- `marketing.campaign`: The user wants an evidence-backed multi-channel campaign plan or campaign content tied to a product, audience, positioning, claims, language, and review process.
- `seo.audit`: The user wants an evidence-backed technical, on-page, structured-data, performance, or content-intent SEO audit without implicit remediation or publication.

### operations

Reference: `references/operations.md`

- `omp.plugin`: The target is an OMP plugin, marketplace entry, packaged skill, hook, agent, or config asset.
- `security.review`: The task explicitly reviews security trust boundaries, vulnerability impact, or remediation.
- `design.visual`: The requested output is a UI, visual asset, diagram, layout, or interaction design.
- `release.opensource`: The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area.
- `release.publish`: The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.

## Runtime authority

- Use only skills that OMP currently exposes.
- Treat listed Agent IDs as optional candidates, never as a whitelist.
- Use an Agent only when it appears in OMP's current dynamic Available Agents list.
- Follow OMP native behavior for TODOs, delegation, tools, approvals, and completion.
