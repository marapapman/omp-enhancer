# `network.design` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `network.design`

- Primary when: The user wants a new or substantially changed enterprise, multi-site, cloud-connected, or segmented network architecture and an implementation plan rather than immediate device mutation.
- Reference steps:
  1. [step-1] Confirm objectives, sites, users, traffic, availability, security, growth, management, budget, and non-goals.
  2. [step-2] Inventory current topology, addressing, routing, segmentation, device capability, operational ownership, and constraints.
  3. [step-3] Design the topology, addressing, segmentation, routing, policy boundaries, and management plane from the confirmed constraints.
  4. [step-4] Define observability, backup, access safety, maintenance windows, phased validation, and rollback before any implementation.
  5. [step-5] Deliver a phased architecture and implementation plan with assumptions, evidence gaps, risks, validation gates, and rollback points.
- Optional Agent candidates: `ecc-network-architect`.
- Optional delegation ideas:
  - steps-2-5: ecc-network-architect owns the read-only architecture analysis, phased design, validation gates, and rollback plan
- Quality checks:
  - requirements and topology correspondence, addressing and segmentation consistency, failure-domain analysis, management access preservation, observability, phased validation, and rollback completeness
- Scope notes:
  - This workflow produces architecture and staged guidance; it does not authorize live network changes.
  - Compose network.review for concrete configuration review and network.debug for evidence-backed incident diagnosis.
- Risk notes:
  - Network changes can remove management access or affect multiple sites; require an out-of-band recovery path and explicit maintenance ownership before execution.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
