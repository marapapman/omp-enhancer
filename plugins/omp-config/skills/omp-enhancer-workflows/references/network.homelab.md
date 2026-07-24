READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `network.homelab` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `network.homelab`

- Primary when: A home or small-lab network plan covers gateways, switching, Wi-Fi, local services, segmentation, DNS, or remote access.
- Reference steps:
  1. [step-1] Confirm operator experience, hardware inventory, current internet and management path, household constraints, goals, and acceptable downtime.
  2. [step-search-local] Main checks the current home network topology, device hardware specifications, firmware versions, ISP configuration, and management access from project notes or authorized inventory.
  3. [step-search-external] When hardware compatibility, firmware stability, protocol support, or ISP-specific behavior could affect the plan, Main uses web_search to search current vendor and community experience (preferred official sources); queries must not contain MAC addresses, public IPs, or credentials. Records version and applicability.
  4. [step-inventory] Check hardware capability and identify the smallest topology that meets the required isolation, service, DNS, Wi-Fi, and remote-access goals.
  5. [step-plan] Plan addressing, DHCP, DNS, VLANs, firewall policy, wireless mapping, local services, and VPN only where the confirmed goals require them.
  6. [step-verify] Order changes so internet, DNS, and management access remain recoverable, with a validation check and rollback point after every disruptive phase.
  7. [step-deliver] Deliver the minimal plan, capability gaps, quick wins, optional later phases, verification commands, and recovery instructions.
- Agent candidates: `ecc-network-architect`.
- Delegated checkpoints:
  - step-inventory: ecc-network-architect applies only the selected homelab skills and produces the bounded topology, staged validation, and rollback plan
  - step-plan: ecc-network-architect applies only the selected homelab skills and produces the bounded topology, staged validation, and rollback plan
  - step-verify: ecc-network-architect applies only the selected homelab skills and produces the bounded topology, staged validation, and rollback plan
  - step-deliver: ecc-network-architect applies only the selected homelab skills and produces the bounded topology, staged validation, and rollback plan
- Quality checks:
  - hardware capability correspondence, minimal topology, addressing and policy consistency, household service continuity, staged validation, management recovery, and rollback clarity
- Scope notes:
  - Use the shared network architect role with homelab skills rather than a second prompt-only architect wrapper.
  - Do not assume VLAN, managed-switch, custom-firmware, public-IP, or port-forwarding capability without evidence.
- Risk notes:
  - DNS, DHCP, firewall, VLAN, and remote-access mistakes can disconnect the household or expose services; prefer staged reversible changes.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.