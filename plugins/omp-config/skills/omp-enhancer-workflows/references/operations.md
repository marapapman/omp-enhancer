# operations workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.

## `omp.plugin`

- Use when: The target is an OMP plugin, marketplace entry, packaged skill, hook, agent, or config asset.
- May compose with: `code.plan`, `code.dev`, `code.test`, `code.review`, `release.publish`.
- Reference steps: (1) [step-1] Inventory plugin assets and live installed state. (2) [step-2] Make the requested change. (3) [step-3] Run targeted tests and package checks. (4) [step-4] Verify marketplace consistency. (5) [step-5] Release, sync, or upgrade only when requested.
- Optional skills: `omp-marketplace-plugin-activation`.
- Optional Agent candidates: `config-librarian`, `reviewer`.
- Optional delegation ideas: step-1: config-librarian inventories plugin assets, marketplace metadata, and installed-runtime state; step-4: reviewer independently checks the plugin diff, package contents, catalog consistency, tests, and runtime parity before release; step-5: the parent retains versioning, publication, synchronization, and final verification ownership.
- Quality checks: package contents, marketplace metadata, installed-runtime parity, and advisory-only lifecycle behavior.
- Scope notes: Publishing is a separate externally visible action.
- Risk notes: none.

## `security.review`

- Use when: The task explicitly reviews security trust boundaries, vulnerability impact, or remediation.
- May compose with: `code.plan`, `code.dev`, `code.review`, `code.test`.
- Reference steps: (1) [step-1] Identify assets, actors, boundaries, callers, and sinks. (2) [step-2] Inspect concrete paths. (3) [step-3] Distinguish demonstrated impact from hypotheses. (4) [step-4] Report evidence, severity, and remediation. (5) [step-5] Independently review high-impact findings.
- Optional skills: `security-review`, `security-scan`.
- Optional Agent candidates: `ecc-security-reviewer`, `omp-target-auditor`.
- Optional delegation ideas: step-2: ecc-security-reviewer traces the concrete trust boundaries, callers, sinks, exploit preconditions, and demonstrated impact; step-5: omp-target-auditor independently challenges high-impact findings, severity, evidence, and remediation feasibility within the bounded security target; step-5: the parent reconciles disagreements and preserves authorization boundaries.
- Quality checks: caller-to-sink evidence, exploit preconditions, impact, and remediation feasibility.
- Scope notes: General security prose is not automatically a code security audit.
- Risk notes: High-impact findings benefit from independent review before remediation or disclosure.

## `design.visual`

- Use when: The requested output is a UI, visual asset, diagram, layout, or interaction design.
- May compose with: `diagram.svg`, `slides.generate`, `slides.modify`, `code.dev`, `code.test`.
- Reference steps: (1) [step-1] Inspect existing visual context and constraints. (2) [step-2] Choose a direction. (3) [step-3] Create or refine the design. (4) [step-4] Review hierarchy, spacing, typography, responsiveness, accessibility, and states. (5) [step-5] Verify in the relevant renderer.
- Optional skills: `frontend-design`, `canvas-design`.
- Optional Agent candidates: `designer`.
- Optional delegation ideas: steps-1-4: designer owns the bounded visual direction, implementation, and refinement while preserving the requested scope; step-5: the parent reconciles rendered evidence and composes diagram.svg, slides.generate, slides.modify, or code.test when independent medium-specific review is required.
- Quality checks: visual coherence, responsive behavior, accessibility, and rendered evidence.
- Scope notes: Publication and deployment are separate workflow steps.
- Risk notes: none.

## `release.opensource`

- Use when: The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area.
- May compose with: `security.review`, `code.test`, `code.review`, `writing.zh`, `writing.en`, `writing.markdown`, `release.publish`.
- Reference steps: (1) [step-1] Confirm the exact source, a distinct staging target, intended public scope, excluded assets and history, license decision, secret and PII policy, required packaging, and whether publication is explicitly out of scope or separately authorized. (2) [step-2] Create or refresh only the authorized staging copy, excluding source history and generated or private artifacts, parameterizing sensitive configuration, and recording every transformation without modifying the source project. (3) [step-3] Run an independent read-only sanitization review of the staged revision for secrets, credentials, PII, internal references, dangerous files, configuration completeness, and retained history, returning evidence inline. (4) [step-4] After the parent accepts a clean or explicitly qualified sanitization result, add only the authorized README, setup, license, contribution, configuration, and issue-template packaging to staging. (5) [step-5] Run project-appropriate tests and package checks inside staging without using publication as a verification step. (6) [step-6] Re-scan the final staged revision after packaging and independently review the source-to-staging diff, sanitization evidence, license, documentation, tests, and remaining public-release risk. (7) [step-7] Deliver the staging path, transformation ledger, sanitization verdict, test evidence, limitations, and review findings; compose release.publish only when the user separately authorizes the exact public target.
- Optional skills: `opensource-pipeline`, `safety-guard`, `verification-before-completion`.
- Optional Agent candidates: `ecc-opensource-forker`, `ecc-opensource-sanitizer`, `ecc-opensource-packager`, `reviewer`.
- Optional delegation ideas: step-2: ecc-opensource-forker owns only the authorized source-to-staging transformation and inline transformation ledger; step-3: ecc-opensource-sanitizer independently scans the staged revision read-only and returns sanitization evidence inline; step-4: ecc-opensource-packager owns only the authorized public packaging files inside staging; step-6: ecc-opensource-sanitizer independently re-scans the final packaged revision read-only; step-6: reviewer independently audits the source-to-staging diff, sanitization, license, documentation, tests, and release boundary; step-7: the parent reconciles all evidence and retains exclusive ownership of any separately authorized publish action.
- Quality checks: source and staging separation, complete transformation ledger, no exposed secret or PII, current final-revision sanitization evidence, license and documentation correspondence, clean package and test evidence, independent diff review, explicit limitations, and separate publish authorization.
- Scope notes: The forker and packager may write only inside the confirmed staging target; the sanitizer and reviewer remain read-only; Sanitization findings return inline and never require a report file in the staged project; No Agent owns publication; the parent may publish only through an explicitly composed release.publish workflow.
- Risk notes: Public release can expose secrets, PII, proprietary history, licenses, or internal infrastructure; a sanitized staging candidate is not permission to publish.

## `release.publish`

- Use when: The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.
- May compose with: `omp.plugin`, `code.dev`, `code.test`, `code.review`, `release.opensource`.
- Reference steps: (1) [step-1] Confirm the requested target and release scope. (2) [step-2] Run relevant preflight checks. (3) [step-3] Perform the requested mutation once. (4) [step-4] Independently verify the remote or installed result. (5) [step-5] Report the exact released state.
- Optional skills: `conventional-commits`, `finishing-a-development-branch`, `verification-before-completion`.
- Optional Agent candidates: `omp-target-auditor`.
- Optional delegation ideas: step-4: omp-target-auditor independently verifies the exact bounded remote, marketplace, deployed, or installed state after the mutation; step-3: the parent alone owns the authorized release mutation, version target, and final reconciliation.
- Quality checks: target and version correspondence, successful preflight, independent post-mutation verification, and exact final state.
- Scope notes: A plan or dry run is not a completed release; Do not infer a different repository, package, ref, environment, or install target.
- Risk notes: Use host approval and the user-authorized target for irreversible or externally visible actions.
