# `network.review` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `network.review`

- Primary when: The user asks for a read-only review of router, switch, firewall, VPN, DNS, DHCP, routing, ACL, or management-plane configuration.
- Reference steps:
  1. [step-1] Freeze the reviewed configuration revision and identify the device role, platform, change intent, maintenance constraints, and adjacent context needed to prove findings.
  2. [step-2] Inspect addressing, interfaces, routing, ACLs, firewall rules, AAA, management access, services, logging, monitoring, and proposed changes without editing them.
  3. [step-3] Trace concrete references and traffic or management paths, separating demonstrated blockers from best-practice suggestions.
  4. [step-4] Report prioritized findings with exact configuration evidence, affected path, trigger, impact, safe correction, validation, and rollback requirements.
- Optional Agent candidates: `ecc-network-config-reviewer`.
- Optional delegation ideas:
  - steps-2-4: ecc-network-config-reviewer independently audits the frozen configuration and returns evidence-backed findings without editing or applying changes
- Quality checks:
  - frozen revision, concrete configuration evidence, reference and path consistency, severity rationale, management-plane safety, actionable validation, rollback, and explicit runtime limitations
- Scope notes:
  - The reviewer is read-only and must not push, apply, or stage device configuration.
  - A static configuration review cannot prove live forwarding state; compose network.debug when runtime evidence is required.
- Risk notes:
  - Never recommend a disruptive command without identifying the affected access path, validation signal, and recovery route.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
