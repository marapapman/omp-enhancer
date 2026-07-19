# `network.homelab` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `network.homelab`

- Primary when: The user wants a safe home or small-lab network plan involving gateways, switches, access points, local services, segmentation, DNS, or remote access.
- Reference steps:
  1. [step-1] Confirm operator experience, hardware inventory, current internet and management path, household constraints, goals, and acceptable downtime.
  2. [step-2] Check hardware capability and identify the smallest topology that meets the required isolation, service, DNS, Wi-Fi, and remote-access goals.
  3. [step-3] Plan addressing, DHCP, DNS, VLANs, firewall policy, wireless mapping, local services, and VPN only where the confirmed goals require them.
  4. [step-4] Order changes so internet, DNS, and management access remain recoverable, with a validation check and rollback point after every disruptive phase.
  5. [step-5] Deliver the minimal plan, capability gaps, quick wins, optional later phases, verification commands, and recovery instructions.
- Optional Agent candidates: `ecc-network-architect`.
- Optional delegation ideas:
  - steps-2-5: ecc-network-architect applies only the selected homelab skills and produces the bounded topology, staged validation, and rollback plan
- Quality checks:
  - hardware capability correspondence, minimal topology, addressing and policy consistency, household service continuity, staged validation, management recovery, and rollback clarity
- Scope notes:
  - Use the shared network architect role with homelab skills rather than a second prompt-only architect wrapper.
  - Do not assume VLAN, managed-switch, custom-firmware, public-IP, or port-forwarding capability without evidence.
- Risk notes:
  - DNS, DHCP, firewall, VLAN, and remote-access mistakes can disconnect the household or expose services; prefer staged reversible changes.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
