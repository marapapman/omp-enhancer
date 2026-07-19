# `security.review` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `security.review`

- Primary when: The task explicitly reviews security trust boundaries, vulnerability impact, or remediation.
- Reference steps:
  1. [step-1] Identify assets, actors, boundaries, callers, and sinks.
  2. [step-2] Inspect concrete paths.
  3. [step-3] Distinguish demonstrated impact from hypotheses.
  4. [step-4] Report evidence, severity, and remediation.
  5. [step-5] Independently review high-impact findings.
- Optional Agent candidates: `ecc-security-reviewer`.
- Optional delegation ideas:
  - step-2: ecc-security-reviewer traces the concrete trust boundaries, callers, sinks, exploit preconditions, and demonstrated impact
  - step-5: ecc-security-reviewer makes one fresh challenge only when Main supplies materially changed high-impact findings or evidence
  - step-5: the parent independently validates findings and preserves authorization boundaries
- Quality checks:
  - caller-to-sink evidence, exploit preconditions, impact, and remediation feasibility
- Scope notes:
  - General security prose is not automatically a code security audit.
- Risk notes:
  - High-impact findings benefit from independent review before remediation or disclosure.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
