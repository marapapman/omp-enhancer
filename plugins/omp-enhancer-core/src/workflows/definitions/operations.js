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
    "roles": [],
    "delegation": [
      "steps-1-5: keep general visual work with the main agent; compose diagram.svg, slides.generate, slides.modify, code.dev, or code.test before delegating to an exact listed role"
    ]
  },
  {
    "id": "release.publish",
    "chooseWhen": "The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.",
    "composeWith": [
      "omp.plugin",
      "code.dev",
      "code.test",
      "code.review"
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
