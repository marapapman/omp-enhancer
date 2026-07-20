---
name: ecc-skill-catalog
description: On-demand index for niche ECC guides, including framework-specific engineering, homelab and network operations, domain compliance, research, and specialized security. Use when a task names a niche technology such as Pi-hole, BGP, Ktor, Laravel, or ClickHouse and no directly visible subject-domain Skill applies. A workflow or Agent does not replace the subject guide, and a writing or output-format Skill does not replace the subject guide. Once selected and read, read catalog.md and then the smallest exact nested guide. Do not load it for routine work.
---

# ECC Skill catalog

This Skill exposes 255 specialized packaged guides without placing every description in OMP's permanent system prompt.

1. First scan the directly visible OMP Skill descriptions.
2. A workflow reference or Agent is not a subject-domain Skill. A writing or output-format Skill is not a direct subject-domain match.
3. Once this adapter is declared and successfully read, the next exact resource read is `skill://ecc-skill-catalog/catalog.md`; wait for that read before claiming the catalog checked or loaded.
4. Choose the smallest matching nested guide and read its exact URI from the catalog; mark it unavailable only after that read fails.
5. Do not bulk-load guides, guess a guide name, or treat a workflow or Agent as a substitute for the catalog or nested subject guide.
6. Do not treat this catalog as permission to widen the task.

OMP native tools, Agents, approvals, permissions, and completion behavior remain authoritative.

ADAPTER HANDOFF (soft): at visible byte 0 declare `RESOURCE EXTENSION | source=skill://ecc-skill-catalog | reads=skill://ecc-skill-catalog/catalog.md`; in that response read only that exact URI, then stop and wait. This is catalog hop 1 of at most 2 and resource extension 1 of at most 3. NOT YET: nested guide, workflow reference, project tool, TODO, task, or answer.
