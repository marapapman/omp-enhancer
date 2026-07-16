# network workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.

## `network.design`

- Use when: The user wants a new or substantially changed enterprise, multi-site, cloud-connected, or segmented network architecture and an implementation plan rather than immediate device mutation.
- May compose with: `network.review`, `network.debug`, `code.plan`, `security.review`.
- Reference steps: (1) [step-1] Confirm objectives, sites, users, traffic, availability, security, growth, management, budget, and non-goals. (2) [step-2] Inventory current topology, addressing, routing, segmentation, device capability, operational ownership, and constraints. (3) [step-3] Design the topology, addressing, segmentation, routing, policy boundaries, and management plane from the confirmed constraints. (4) [step-4] Define observability, backup, access safety, maintenance windows, phased validation, and rollback before any implementation. (5) [step-5] Deliver a phased architecture and implementation plan with assumptions, evidence gaps, risks, validation gates, and rollback points.
- Optional skills: `network-config-validation`, `safety-guard`.
- Optional Agent candidates: `ecc-network-architect`.
- Optional delegation ideas: steps-2-5: ecc-network-architect owns the read-only architecture analysis, phased design, validation gates, and rollback plan.
- Quality checks: requirements and topology correspondence, addressing and segmentation consistency, failure-domain analysis, management access preservation, observability, phased validation, and rollback completeness.
- Scope notes: This workflow produces architecture and staged guidance; it does not authorize live network changes; Compose network.review for concrete configuration review and network.debug for evidence-backed incident diagnosis.
- Risk notes: Network changes can remove management access or affect multiple sites; require an out-of-band recovery path and explicit maintenance ownership before execution.

## `network.homelab`

- Use when: The user wants a safe home or small-lab network plan involving gateways, switches, access points, local services, segmentation, DNS, or remote access.
- May compose with: `network.design`, `network.review`, `network.debug`, `security.review`.
- Reference steps: (1) [step-1] Confirm operator experience, hardware inventory, current internet and management path, household constraints, goals, and acceptable downtime. (2) [step-2] Check hardware capability and identify the smallest topology that meets the required isolation, service, DNS, Wi-Fi, and remote-access goals. (3) [step-3] Plan addressing, DHCP, DNS, VLANs, firewall policy, wireless mapping, local services, and VPN only where the confirmed goals require them. (4) [step-4] Order changes so internet, DNS, and management access remain recoverable, with a validation check and rollback point after every disruptive phase. (5) [step-5] Deliver the minimal plan, capability gaps, quick wins, optional later phases, verification commands, and recovery instructions.
- Optional skills: `homelab-network-readiness`, `homelab-network-setup`, `homelab-pihole-dns`, `homelab-vlan-segmentation`, `homelab-wireguard-vpn`, `safety-guard`.
- Optional Agent candidates: `ecc-network-architect`.
- Optional delegation ideas: steps-2-5: ecc-network-architect applies only the selected homelab skills and produces the bounded topology, staged validation, and rollback plan.
- Quality checks: hardware capability correspondence, minimal topology, addressing and policy consistency, household service continuity, staged validation, management recovery, and rollback clarity.
- Scope notes: Use the shared network architect role with homelab skills rather than a second prompt-only architect wrapper; Do not assume VLAN, managed-switch, custom-firmware, public-IP, or port-forwarding capability without evidence.
- Risk notes: DNS, DHCP, firewall, VLAN, and remote-access mistakes can disconnect the household or expose services; prefer staged reversible changes.

## `network.review`

- Use when: The user asks for a read-only review of router, switch, firewall, VPN, DNS, DHCP, routing, ACL, or management-plane configuration.
- May compose with: `network.design`, `network.debug`, `code.review`, `security.review`.
- Reference steps: (1) [step-1] Freeze the reviewed configuration revision and identify the device role, platform, change intent, maintenance constraints, and adjacent context needed to prove findings. (2) [step-2] Inspect addressing, interfaces, routing, ACLs, firewall rules, AAA, management access, services, logging, monitoring, and proposed changes without editing them. (3) [step-3] Trace concrete references and traffic or management paths, separating demonstrated blockers from best-practice suggestions. (4) [step-4] Report prioritized findings with exact configuration evidence, affected path, trigger, impact, safe correction, validation, and rollback requirements.
- Optional skills: `network-config-validation`, `safety-guard`.
- Optional Agent candidates: `ecc-network-config-reviewer`.
- Optional delegation ideas: steps-2-4: ecc-network-config-reviewer independently audits the frozen configuration and returns evidence-backed findings without editing or applying changes.
- Quality checks: frozen revision, concrete configuration evidence, reference and path consistency, severity rationale, management-plane safety, actionable validation, rollback, and explicit runtime limitations.
- Scope notes: The reviewer is read-only and must not push, apply, or stage device configuration; A static configuration review cannot prove live forwarding state; compose network.debug when runtime evidence is required.
- Risk notes: Never recommend a disruptive command without identifying the affected access path, validation signal, and recovery route.

## `network.debug`

- Use when: The task is to diagnose a concrete connectivity, routing, DNS, interface, BGP, firewall, policy, or management symptom using read-only evidence.
- May compose with: `network.review`, `network.design`, `code.debug`, `security.review`.
- Reference steps: (1) [step-1] Characterize the symptom, affected endpoints, direction, timing, scope, last-known-good state, and recent changes. (2) [step-2] Collect the smallest host- or operator-authorized read-only evidence across the relevant link, interface, addressing, routing, DNS, policy, and application layers. (3) [step-3] Form ranked hypotheses and test whether each explains every observed symptom without changing live state. (4) [step-4] Identify the root cause or the narrowest remaining uncertainty with command output, counters, routes, policy, logs, or configuration evidence. (5) [step-5] Return safe next actions, verification criteria, maintenance and rollback needs, and any evidence still required before a change.
- Optional skills: `network-interface-health`, `network-bgp-diagnostics`, `netmiko-ssh-automation`, `systematic-debugging`.
- Optional Agent candidates: `ecc-network-troubleshooter`.
- Optional delegation ideas: steps-2-5: ecc-network-troubleshooter owns bounded read-only evidence collection, hypothesis testing, root-cause analysis, and the safe verification plan.
- Quality checks: symptom correspondence, bounded read-only evidence, OSI and policy path coverage, hypothesis discrimination, root-cause completeness, safe verification, and explicit uncertainty.
- Scope notes: Diagnosis remains read-only; a recommended live change needs separate user authorization and host approval; Do not collect broad device state when a smaller command set can distinguish the hypotheses.
- Risk notes: Even diagnostic collection can expose secrets or burden devices; redact credentials and use bounded read-only commands.
