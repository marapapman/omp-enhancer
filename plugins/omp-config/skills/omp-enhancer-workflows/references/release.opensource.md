# `release.opensource` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `release.opensource`

- Primary when: The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area.
- Reference steps:
  1. [step-1] Confirm the exact source, a distinct staging target, intended public scope, excluded assets and history, license decision, secret and PII policy, required packaging, and whether publication is explicitly out of scope or separately authorized.
  2. [step-2] Create or refresh only the authorized staging copy, excluding source history and generated or private artifacts, parameterizing sensitive configuration, and recording every transformation without modifying the source project.
  3. [step-3] Run an independent read-only sanitization review of the staged revision for secrets, credentials, PII, internal references, dangerous files, configuration completeness, and retained history, returning evidence inline.
  4. [step-4] After the parent accepts a clean or explicitly qualified sanitization result, add only the authorized README, setup, license, contribution, configuration, and issue-template packaging to staging.
  5. [step-5] Run project-appropriate tests and package checks inside staging without using publication as a verification step.
  6. [step-6] Re-scan the final staged revision after packaging and independently review the source-to-staging diff, sanitization evidence, license, documentation, tests, and remaining public-release risk.
  7. [step-7] Deliver the staging path, transformation ledger, sanitization verdict, test evidence, limitations, and review findings; apply release.publish only when it was selected in PLAN for an explicitly authorized public target.
- Optional Agent candidates: `ecc-opensource-forker`, `ecc-opensource-sanitizer`, `ecc-opensource-packager`, `reviewer`.
- Optional delegation ideas:
  - step-2: ecc-opensource-forker owns only the authorized source-to-staging transformation and inline transformation ledger
  - step-3: ecc-opensource-sanitizer independently scans the staged revision read-only and returns sanitization evidence inline
  - step-4: ecc-opensource-packager owns only the authorized public packaging files inside staging
  - step-6: ecc-opensource-sanitizer independently re-scans the final packaged revision read-only
  - step-6: reviewer independently audits the source-to-staging diff, sanitization, license, documentation, tests, and release boundary
  - step-7: the parent reconciles all evidence and retains exclusive ownership of any separately authorized publish action
- Quality checks:
  - source and staging separation, complete transformation ledger, no exposed secret or PII, current final-revision sanitization evidence, license and documentation correspondence, clean package and test evidence, independent diff review, explicit limitations, and separate publish authorization
- Scope notes:
  - The forker and packager may write only inside the confirmed staging target; the sanitizer and reviewer remain read-only.
  - Sanitization findings return inline and never require a report file in the staged project.
  - No Agent owns publication; the parent may publish only through an explicitly composed release.publish workflow.
- Risk notes:
  - Public release can expose secrets, PII, proprietary history, licenses, or internal infrastructure; a sanitized staging candidate is not permission to publish.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
