export const operationWorkflows = [
  {
    "id": "omp.plugin",
    "chooseWhen": "The target is an OMP plugin, marketplace entry, packaged skill, hook, agent, or config asset.",
    "composeWith": [
      "code.plan",
      "code.dev",
      "code.test",
      "code.review",
      "release.publish"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Inventory plugin assets and live installed state."
      },
      {
        "id": "step-2",
        "text": "Make the requested change."
      },
      {
        "id": "step-3",
        "text": "Run targeted tests and package checks."
      },
      {
        "id": "step-4",
        "text": "Verify marketplace consistency."
      },
      {
        "id": "step-5",
        "text": "Release, sync, or upgrade only when requested."
      }
    ],
    "scopeNotes": [
      "Publishing is a separate externally visible action."
    ],
    "skills": [
      "omp-marketplace-plugin-activation"
    ],
    "qualityChecks": [
      "package contents, marketplace metadata, installed-runtime parity, and advisory-only lifecycle behavior"
    ],
    "riskNotes": [],
    "roles": [
      "config-librarian",
      "reviewer"
    ],
    "delegation": [
      "step-1: config-librarian inventories plugin assets, marketplace metadata, and installed-runtime state",
      "step-4: reviewer independently checks package contents, catalog consistency, tests, and runtime parity before release",
      "step-5: the parent retains versioning, publication, synchronization, and final verification ownership"
    ]
  },
  {
    "id": "security.review",
    "chooseWhen": "The task explicitly reviews security trust boundaries, vulnerability impact, or remediation.",
    "composeWith": [
      "code.plan",
      "code.dev",
      "code.review",
      "code.test"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Identify assets, actors, boundaries, callers, and sinks."
      },
      {
        "id": "step-2",
        "text": "Inspect concrete paths."
      },
      {
        "id": "step-3",
        "text": "Distinguish demonstrated impact from hypotheses."
      },
      {
        "id": "step-4",
        "text": "Report evidence, severity, and remediation."
      },
      {
        "id": "step-5",
        "text": "Independently review high-impact findings."
      }
    ],
    "scopeNotes": [
      "General security prose is not automatically a code security audit."
    ],
    "skills": [
      "security-review",
      "security-scan"
    ],
    "qualityChecks": [
      "caller-to-sink evidence, exploit preconditions, impact, and remediation feasibility"
    ],
    "riskNotes": [
      "High-impact findings benefit from independent review before remediation or disclosure."
    ],
    "roles": [
      "ecc-security-reviewer",
      "reviewer"
    ],
    "delegation": [
      "step-2: ecc-security-reviewer traces the concrete trust boundaries, callers, sinks, exploit preconditions, and demonstrated impact",
      "step-5: reviewer independently challenges high-impact findings, severity, evidence, and remediation feasibility",
      "step-5: the parent reconciles disagreements and preserves authorization boundaries"
    ]
  },
  {
    "id": "design.visual",
    "chooseWhen": "The requested output is a UI, visual asset, diagram, layout, or interaction design.",
    "composeWith": [
      "diagram.svg",
      "slides.generate",
      "slides.modify",
      "code.dev",
      "code.test"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Inspect existing visual context and constraints."
      },
      {
        "id": "step-2",
        "text": "Choose a direction."
      },
      {
        "id": "step-3",
        "text": "Create or refine the design."
      },
      {
        "id": "step-4",
        "text": "Review hierarchy, spacing, typography, responsiveness, accessibility, and states."
      },
      {
        "id": "step-5",
        "text": "Verify in the relevant renderer."
      }
    ],
    "scopeNotes": [
      "Publication and deployment are separate workflow steps."
    ],
    "skills": [
      "frontend-design",
      "canvas-design"
    ],
    "qualityChecks": [
      "visual coherence, responsive behavior, accessibility, and rendered evidence"
    ],
    "riskNotes": [],
    "roles": [
      "designer"
    ],
    "delegation": [
      "steps-1-4: designer owns the bounded visual direction, implementation, and refinement while preserving the requested scope",
      "step-5: the parent reconciles rendered evidence and composes diagram.svg, slides.generate, slides.modify, or code.test when independent medium-specific review is required"
    ]
  },
  {
    "id": "release.opensource",
    "chooseWhen": "The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area.",
    "composeWith": [
      "security.review",
      "code.test",
      "code.review",
      "writing.zh",
      "writing.en",
      "writing.markdown",
      "release.publish"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm the exact source, a distinct staging target, intended public scope, excluded assets and history, license decision, secret and PII policy, required packaging, and whether publication is explicitly out of scope or separately authorized."
      },
      {
        "id": "step-2",
        "text": "Create or refresh only the authorized staging copy, excluding source history and generated or private artifacts, parameterizing sensitive configuration, and recording every transformation without modifying the source project."
      },
      {
        "id": "step-3",
        "text": "Run an independent read-only sanitization review of the staged revision for secrets, credentials, PII, internal references, dangerous files, configuration completeness, and retained history, returning evidence inline."
      },
      {
        "id": "step-4",
        "text": "After the parent accepts a clean or explicitly qualified sanitization result, add only the authorized README, setup, license, contribution, configuration, and issue-template packaging to staging."
      },
      {
        "id": "step-5",
        "text": "Run project-appropriate tests and package checks inside staging without using publication as a verification step."
      },
      {
        "id": "step-6",
        "text": "Re-scan the final staged revision after packaging and independently review the source-to-staging diff, sanitization evidence, license, documentation, tests, and remaining public-release risk."
      },
      {
        "id": "step-7",
        "text": "Deliver the staging path, transformation ledger, sanitization verdict, test evidence, limitations, and review findings; compose release.publish only when the user separately authorizes the exact public target."
      }
    ],
    "scopeNotes": [
      "The forker and packager may write only inside the confirmed staging target; the sanitizer and reviewer remain read-only.",
      "Sanitization findings return inline and never require a report file in the staged project.",
      "No Agent owns publication; the parent may publish only through an explicitly composed release.publish workflow."
    ],
    "skills": [
      "opensource-pipeline",
      "safety-guard",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "source and staging separation, complete transformation ledger, no exposed secret or PII, current final-revision sanitization evidence, license and documentation correspondence, clean package and test evidence, independent diff review, explicit limitations, and separate publish authorization"
    ],
    "riskNotes": [
      "Public release can expose secrets, PII, proprietary history, licenses, or internal infrastructure; a sanitized staging candidate is not permission to publish."
    ],
    "roles": [
      "ecc-opensource-forker",
      "ecc-opensource-sanitizer",
      "ecc-opensource-packager",
      "reviewer"
    ],
    "delegation": [
      "step-2: ecc-opensource-forker owns only the authorized source-to-staging transformation and inline transformation ledger",
      "step-3: ecc-opensource-sanitizer independently scans the staged revision read-only and returns sanitization evidence inline",
      "step-4: ecc-opensource-packager owns only the authorized public packaging files inside staging",
      "step-6: ecc-opensource-sanitizer independently re-scans the final packaged revision read-only",
      "step-6: reviewer independently audits the source-to-staging diff, sanitization, license, documentation, tests, and release boundary",
      "step-7: the parent reconciles all evidence and retains exclusive ownership of any separately authorized publish action"
    ]
  },
  {
    "id": "release.publish",
    "chooseWhen": "The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.",
    "composeWith": [
      "omp.plugin",
      "code.dev",
      "code.test",
      "code.review",
      "release.opensource"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm the requested target and release scope."
      },
      {
        "id": "step-2",
        "text": "Run relevant preflight checks."
      },
      {
        "id": "step-3",
        "text": "Perform the requested mutation once."
      },
      {
        "id": "step-4",
        "text": "Independently verify the remote or installed result."
      },
      {
        "id": "step-5",
        "text": "Report the exact released state."
      }
    ],
    "scopeNotes": [
      "A plan or dry run is not a completed release.",
      "Do not infer a different repository, package, ref, environment, or install target."
    ],
    "skills": [
      "conventional-commits",
      "finishing-a-development-branch",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "target and version correspondence, successful preflight, independent post-mutation verification, and exact final state"
    ],
    "riskNotes": [
      "Use host approval and the user-authorized target for irreversible or externally visible actions."
    ],
    "roles": [
      "reviewer"
    ],
    "delegation": [
      "step-4: reviewer independently verifies the exact remote, marketplace, deployed, or installed state after the mutation",
      "step-3: the parent alone owns the authorized release mutation, version target, and final reconciliation"
    ]
  }
];
