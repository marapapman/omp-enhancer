# `seo.audit` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `seo.audit`

- Primary when: The user wants an evidence-backed technical, on-page, structured-data, performance, or content-intent SEO audit without implicit remediation or publication.
- Reference steps:
  1. [step-1] Confirm the site and revision, target market and language, important URLs, search intent, analytics and search-console evidence available, crawl boundary, and requested audit depth.
  2. [step-2] Collect current crawl, indexability, canonical, redirect, sitemap, robots, metadata, heading, internal-link, structured-data, mobile render, and performance evidence from authorized sources.
  3. [step-3] Map each finding to a concrete URL, source or render artifact, observed behavior, affected search or user intent, severity, and reproducible validation.
  4. [step-4] Separate demonstrated technical defects from content hypotheses, keyword opportunities, third-party estimates, and recommendations that require live experiments.
  5. [step-5] Deliver a prioritized audit with crawl and index evidence, current render and performance limitations, safe remediation order, and the workflows required for authorized code or prose changes.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - steps-1-4: keep SEO synthesis with the parent and compose research.web, writing.zh, writing.en, or design.visual before using their exact roles
  - step-5: the parent reconciles crawl, index, render, performance, language, and evidence limitations
- Quality checks:
  - crawl boundary, index and canonical evidence, URL-to-finding correspondence, current render evidence, structured-data correspondence, measured performance evidence, language and search-intent fit, prioritization rationale, and explicit limitations
- Scope notes:
  - Keep the audit with the parent and use exact roles only through composed research, review, test, writing, performance, or visual workflows.
  - SEO recommendations do not authorize site edits, deployment, analytics changes, outreach, or publication.
- Risk notes:
  - Search-engine behavior and third-party metrics change over time; label estimates and retrieve current primary evidence where material.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
