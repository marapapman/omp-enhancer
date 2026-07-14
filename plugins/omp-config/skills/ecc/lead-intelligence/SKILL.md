---
name: lead-intelligence
description: Research, qualify, rank, and draft outreach for prospective contacts from authorized public or user-provided data. Use when the user requests lead research or warm-path analysis; external sending always requires separate explicit approval.
origin: ECC
---

# Lead Intelligence

Compose reliable research, fact checking, and the appropriate language-writing workflow. This skill defines domain evidence; it does not register private nested Agents or assume connectors exist.

## Preconditions

Confirm the target market, legitimate purpose, geography, allowed sources, fields, retention, ranking criteria, excluded people or organizations, and whether the deliverable is research only or includes drafts. Discover tools before promising coverage. Do not bypass access controls, scrape prohibited private data, infer sensitive traits, or enrich with purchased data unless the user has authorized the source and its use.

## Procedure

1. Use `research.web` or `research.technical` to collect current public evidence from primary company, professional, regulatory, repository, or publication sources. Record source, date, and the exact claim each source supports.
2. Use `factcheck.document` to cross-check identity, current role, organization, recent activity, and any claimed relationship. Do not merge people on name similarity alone.
3. Define the scoring formula before ranking. Separate observed facts from inferred fit, report missing fields, and avoid protected or sensitive attributes.
4. For warm paths, use only connections the user supplied or explicitly authorized tools expose. Label direct, one-hop, and inferred relationships distinctly.
5. Draft outreach through `writing.zh` or `writing.en` according to the source and requested language. Ground every personalization in verified evidence and avoid manipulative, deceptive, or mass-spam wording.
6. Return drafts only. Sending email, messages, connection requests, public posts, CRM writes, or list exports is an external mutation that requires a separate explicit instruction and the appropriate connector workflow.

## Output

Provide a source-linked lead table with confidence and freshness, transparent ranking inputs, verified warm-path evidence, excluded or ambiguous records, and optional drafts. Redact private contact data from reusable reports and state tool or source limitations.
