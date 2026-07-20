export const networkWorkflows = [
  {
    "id": "network.design",
    "chooseWhen": "A new or substantially changed enterprise, multi-site, cloud-connected, or segmented network architecture needs an implementation plan, not immediate device mutation.",
    "composeWith": [
      "network.review",
      "network.debug",
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm objectives, sites, users, traffic, availability, security, growth, management, budget, and non-goals."
      },
      {
        "id": "step-2",
        "text": "Inventory current topology, addressing, routing, segmentation, device capability, operational ownership, and constraints."
      },
      {
        "id": "step-3",
        "text": "Design the topology, addressing, segmentation, routing, policy boundaries, and management plane from the confirmed constraints."
      },
      {
        "id": "step-4",
        "text": "Define observability, backup, access safety, maintenance windows, phased validation, and rollback before any implementation."
      },
      {
        "id": "step-5",
        "text": "Deliver a phased architecture and implementation plan with assumptions, evidence gaps, risks, validation gates, and rollback points."
      }
    ],
    "scopeNotes": [
      "This workflow produces architecture and staged guidance; it does not authorize live network changes.",
      "Compose network.review for concrete configuration review and network.debug for evidence-backed incident diagnosis."
    ],
    "skills": [
      "network-config-validation",
      "safety-guard"
    ],
    "catalogSkills": [
      "network-config-validation",
      "safety-guard"
    ],
    "qualityChecks": [
      "requirements and topology correspondence, addressing and segmentation consistency, failure-domain analysis, management access preservation, observability, phased validation, and rollback completeness"
    ],
    "riskNotes": [
      "Network changes can remove management access or affect multiple sites; require an out-of-band recovery path and explicit maintenance ownership before execution."
    ],
    "roles": [
      "ecc-network-architect"
    ],
    "delegation": [
      "steps-2-5: ecc-network-architect owns the read-only architecture analysis, phased design, validation gates, and rollback plan"
    ]
  },
  {
    "id": "network.homelab",
    "chooseWhen": "A home or small-lab network plan covers gateways, switching, Wi-Fi, local services, segmentation, DNS, or remote access.",
    "composeWith": [
      "network.design",
      "network.review",
      "network.debug",
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm operator experience, hardware inventory, current internet and management path, household constraints, goals, and acceptable downtime."
      },
      {
        "id": "step-2",
        "text": "Check hardware capability and identify the smallest topology that meets the required isolation, service, DNS, Wi-Fi, and remote-access goals."
      },
      {
        "id": "step-3",
        "text": "Plan addressing, DHCP, DNS, VLANs, firewall policy, wireless mapping, local services, and VPN only where the confirmed goals require them."
      },
      {
        "id": "step-4",
        "text": "Order changes so internet, DNS, and management access remain recoverable, with a validation check and rollback point after every disruptive phase."
      },
      {
        "id": "step-5",
        "text": "Deliver the minimal plan, capability gaps, quick wins, optional later phases, verification commands, and recovery instructions."
      }
    ],
    "scopeNotes": [
      "Use the shared network architect role with homelab skills rather than a second prompt-only architect wrapper.",
      "Do not assume VLAN, managed-switch, custom-firmware, public-IP, or port-forwarding capability without evidence."
    ],
    "skills": [
      "homelab-network-readiness",
      "homelab-network-setup",
      "homelab-pihole-dns",
      "homelab-vlan-segmentation",
      "homelab-wireguard-vpn",
      "safety-guard"
    ],
    "catalogSkills": [
      "homelab-network-readiness",
      "homelab-network-setup",
      "homelab-pihole-dns",
      "homelab-vlan-segmentation",
      "homelab-wireguard-vpn",
      "safety-guard"
    ],
    "qualityChecks": [
      "hardware capability correspondence, minimal topology, addressing and policy consistency, household service continuity, staged validation, management recovery, and rollback clarity"
    ],
    "riskNotes": [
      "DNS, DHCP, firewall, VLAN, and remote-access mistakes can disconnect the household or expose services; prefer staged reversible changes."
    ],
    "roles": [
      "ecc-network-architect"
    ],
    "delegation": [
      "steps-2-5: ecc-network-architect applies only the selected homelab skills and produces the bounded topology, staged validation, and rollback plan"
    ]
  },
  {
    "id": "network.review",
    "chooseWhen": "The user asks for a read-only review of router, switch, firewall, VPN, DNS, DHCP, routing, ACL, or management-plane configuration.",
    "composeWith": [
      "network.design",
      "network.debug",
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Freeze the reviewed configuration revision and identify the device role, platform, change intent, maintenance constraints, and adjacent context needed to prove findings."
      },
      {
        "id": "step-2",
        "text": "Inspect addressing, interfaces, routing, ACLs, firewall rules, AAA, management access, services, logging, monitoring, and proposed changes without editing them."
      },
      {
        "id": "step-3",
        "text": "Trace concrete references and traffic or management paths, separating demonstrated blockers from best-practice suggestions."
      },
      {
        "id": "step-4",
        "text": "Report prioritized findings with exact configuration evidence, affected path, trigger, impact, safe correction, validation, and rollback requirements."
      }
    ],
    "scopeNotes": [
      "The reviewer is read-only and must not push, apply, or stage device configuration.",
      "A static configuration review cannot prove live forwarding state; compose network.debug when runtime evidence is required."
    ],
    "skills": [
      "network-config-validation",
      "safety-guard"
    ],
    "catalogSkills": [
      "network-config-validation",
      "safety-guard"
    ],
    "qualityChecks": [
      "frozen revision, concrete configuration evidence, reference and path consistency, severity rationale, management-plane safety, actionable validation, rollback, and explicit runtime limitations"
    ],
    "riskNotes": [
      "Never recommend a disruptive command without identifying the affected access path, validation signal, and recovery route."
    ],
    "roles": [
      "ecc-network-config-reviewer"
    ],
    "delegation": [
      "steps-2-4: ecc-network-config-reviewer independently audits the frozen configuration and returns evidence-backed findings without editing or applying changes"
    ]
  },
  {
    "id": "network.debug",
    "chooseWhen": "The task is to diagnose a concrete connectivity, routing, DNS, interface, BGP, firewall, policy, or management symptom using read-only evidence.",
    "composeWith": [
      "network.review",
      "network.design",
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Characterize the symptom, affected endpoints, direction, timing, scope, last-known-good state, and recent changes."
      },
      {
        "id": "step-2",
        "text": "Collect the smallest host- or operator-authorized read-only evidence across the relevant link, interface, addressing, routing, DNS, policy, and application layers."
      },
      {
        "id": "step-3",
        "text": "Form ranked hypotheses and test whether each explains every observed symptom without changing live state."
      },
      {
        "id": "step-4",
        "text": "Identify the root cause or the narrowest remaining uncertainty with command output, counters, routes, policy, logs, or configuration evidence."
      },
      {
        "id": "step-5",
        "text": "Return safe next actions, verification criteria, maintenance and rollback needs, and any evidence still required before a change."
      }
    ],
    "scopeNotes": [
      "Diagnosis remains read-only; a recommended live change needs separate user authorization and host approval.",
      "Do not collect broad device state when a smaller command set can distinguish the hypotheses."
    ],
    "skills": [
      "network-interface-health",
      "network-bgp-diagnostics",
      "netmiko-ssh-automation"
    ],
    "catalogSkills": [
      "network-interface-health",
      "network-bgp-diagnostics",
      "netmiko-ssh-automation"
    ],
    "qualityChecks": [
      "symptom correspondence, bounded read-only evidence, OSI and policy path coverage, hypothesis discrimination, root-cause completeness, safe verification, and explicit uncertainty"
    ],
    "riskNotes": [
      "Even diagnostic collection can expose secrets or burden devices; redact credentials and use bounded read-only commands."
    ],
    "roles": [
      "ecc-network-troubleshooter"
    ],
    "delegation": [
      "steps-2-5: ecc-network-troubleshooter owns bounded read-only evidence collection, hypothesis testing, root-cause analysis, and the safe verification plan"
    ]
  }
];
