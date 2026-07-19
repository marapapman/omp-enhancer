---
name: hipaa-compliance
description: Apply HIPAA-specific privacy and security questions when a task explicitly concerns PHI, covered entities, business associates, BAAs, or US healthcare data handling. This is a knowledge overlay, not a standalone medical workflow or legal determination.
origin: ECC direct-port adaptation
version: "1.1.0"
---

# HIPAA Compliance Overlay

Use `healthcare-phi-compliance` for PHI data-flow guidance and compose the ordinary `security.review`, `code.dev`, `factcheck.document`, or research workflow needed by the user's actual request. There is no dedicated healthcare workflow or healthcare Agent.

HIPAA obligations and agency guidance can change. For a high-stakes or current compliance conclusion, use reliable primary sources and an independent fact check, state the jurisdiction and date, and recommend qualified legal or compliance review. Do not present this skill as legal advice.

## Questions to Resolve

1. What data is created, received, maintained, or transmitted, and can it be linked to an individual?
2. Which party is the covered entity, business associate, subcontractor, or other actor, and what agreement governs the processing?
3. Is every data field and access path necessary for the authorized purpose?
4. Are identity, authorization, audit, retention, export, deletion, incident response, and vendor boundaries explicit?
5. Do logs, analytics, crash reports, prompts, model providers, support tools, browser storage, URLs, screenshots, backups, or test fixtures receive PHI?
6. What evidence supports encryption, key handling, access review, audit integrity, recovery, and breach procedures in the actual target environment?

## Guardrails

- Use synthetic or irreversibly de-identified examples; never copy real PHI into prompts or reusable artifacts.
- Keep PHI out of URLs, client-visible errors, analytics, general logs, screenshots, and unapproved third parties.
- Require scoped authentication and authorization plus auditable reads, writes, exports, and administrative actions.
- Treat third-party processing as blocked until its contract, BAA status where applicable, data region, retention, subprocessors, and model-training policy are verified.
- Separate a technical control finding from a legal applicability conclusion, and label uncertainty.

## Output

Return the scoped data-flow, actor and vendor assumptions, current primary evidence, concrete control findings, unverified obligations, and the owner who must resolve each high-stakes decision. A review finding is advisory evidence, not permission to deploy or process PHI.
