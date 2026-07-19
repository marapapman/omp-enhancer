# `network.debug` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `network.debug`

- Primary when: The task is to diagnose a concrete connectivity, routing, DNS, interface, BGP, firewall, policy, or management symptom using read-only evidence.
- Reference steps:
  1. [step-1] Characterize the symptom, affected endpoints, direction, timing, scope, last-known-good state, and recent changes.
  2. [step-2] Collect the smallest host- or operator-authorized read-only evidence across the relevant link, interface, addressing, routing, DNS, policy, and application layers.
  3. [step-3] Form ranked hypotheses and test whether each explains every observed symptom without changing live state.
  4. [step-4] Identify the root cause or the narrowest remaining uncertainty with command output, counters, routes, policy, logs, or configuration evidence.
  5. [step-5] Return safe next actions, verification criteria, maintenance and rollback needs, and any evidence still required before a change.
- Optional Agent candidates: `ecc-network-troubleshooter`.
- Optional delegation ideas:
  - steps-2-5: ecc-network-troubleshooter owns bounded read-only evidence collection, hypothesis testing, root-cause analysis, and the safe verification plan
- Quality checks:
  - symptom correspondence, bounded read-only evidence, OSI and policy path coverage, hypothesis discrimination, root-cause completeness, safe verification, and explicit uncertainty
- Scope notes:
  - Diagnosis remains read-only; a recommended live change needs separate user authorization and host approval.
  - Do not collect broad device state when a smaller command set can distinguish the hypotheses.
- Risk notes:
  - Even diagnostic collection can expose secrets or burden devices; redact credentials and use bounded read-only commands.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
