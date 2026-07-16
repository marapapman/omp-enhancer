export const codeWorkflows = [
  {
    "id": "code.plan",
    "chooseWhen": "The deliverable is an implementation, repair, migration, or test plan rather than the change itself.",
    "composeWith": [
      "code.review",
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Inspect minimal implementation and test context."
      },
      {
        "id": "step-2",
        "text": "Define scope and invariants."
      },
      {
        "id": "step-3",
        "text": "Decompose implementation and verification."
      },
      {
        "id": "step-4",
        "text": "Record dependencies and risks."
      },
      {
        "id": "step-5",
        "text": "Deliver an actionable plan without executing it."
      }
    ],
    "scopeNotes": [
      "Planning is advisory and does not imply permission to edit files or run tests."
    ],
    "skills": [
      "brainstorming",
      "writing-plans"
    ],
    "qualityChecks": [
      "scope completeness, dependency order, and verification correspondence"
    ],
    "riskNotes": [],
    "roles": [
      "explore",
      "plan"
    ],
    "delegation": [
      "step-1: explore performs bounded read-only inspection of the implementation and test context",
      "steps-2-5: plan owns the complete advisory implementation and verification plan without editing files or running tests"
    ]
  },
  {
    "id": "code.dev",
    "chooseWhen": "The user authorizes a code or configuration change, usually with verification.",
    "composeWith": [
      "code.debug",
      "code.test",
      "code.review",
      "security.review",
      "omp.plugin"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Inspect affected code, tests, and conventions."
      },
      {
        "id": "step-2",
        "text": "Plan the smallest coherent change."
      },
      {
        "id": "step-3",
        "text": "Write or update focused tests where appropriate."
      },
      {
        "id": "step-4",
        "text": "Implement."
      },
      {
        "id": "step-5",
        "text": "Verify and review the semantic diff."
      }
    ],
    "scopeNotes": [
      "Release or deployment is a separate step when the user requests it."
    ],
    "skills": [
      "brainstorming",
      "test-driven-development",
      "subagent-driven-development",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "focused tests, behavior preservation, semantic diff review, and user-scope compliance"
    ],
    "riskNotes": [],
    "roles": [
      "explore",
      "plan",
      "implementation-task",
      "reviewer"
    ],
    "delegation": [
      "step-1: explore performs bounded read-only inspection of affected code, tests, callers, and conventions",
      "step-2: plan owns the bounded implementation and verification plan without editing files",
      "steps-3-4: implementation-task owns the planned implementation and focused tests within its assigned scope",
      "step-5: reviewer independently audits the semantic diff, tests, scope, and evidence without taking over integration"
    ]
  },
  {
    "id": "code.debug",
    "chooseWhen": "The task is to reproduce, localize, or explain a concrete failure or mismatch.",
    "composeWith": [
      "code.dev",
      "code.test",
      "code.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Reproduce or localize the failure."
      },
      {
        "id": "step-2",
        "text": "Trace the concrete path and runtime truth."
      },
      {
        "id": "step-3",
        "text": "Form and test hypotheses."
      },
      {
        "id": "step-4",
        "text": "Explain the root cause with evidence."
      },
      {
        "id": "step-5",
        "text": "Compose code.dev only when a fix is requested."
      }
    ],
    "scopeNotes": [
      "Implementation is a follow-on step when a fix is in scope."
    ],
    "skills": [
      "diagnose",
      "systematic-debugging"
    ],
    "qualityChecks": [
      "reproducible evidence, cause rather than symptom, and installed-versus-source consistency"
    ],
    "riskNotes": [],
    "roles": [],
    "delegation": [
      "steps-1-4: keep diagnosis with the main agent; compose code.dev, code.test, security.review, or another specialized workflow before delegating a checkpoint to its exact listed role"
    ]
  },
  {
    "id": "code.test",
    "chooseWhen": "The task requires designing, adding, running, or interpreting tests.",
    "composeWith": [
      "code.plan",
      "code.dev",
      "code.debug",
      "code.review",
      "omp.plugin"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm the authorized test scope, project instructions, target revision, and whether the task requires test design, authoring, execution, or interpretation."
      },
      {
        "id": "step-2",
        "text": "Have test-planner inspect public behavior, existing tests, risk, fixtures, real project commands, and available browser, coverage, or mutation context, then produce a target-to-behavior and evidence plan without editing files or running tests."
      },
      {
        "id": "step-3",
        "text": "When authoring is in scope, have test-executor make only the planned bounded test-file and test-fixture changes through public behavior; route any required production-code change through code.dev."
      },
      {
        "id": "step-4",
        "text": "Have test-executor run only host-authorized real project commands and collect fresh route-specific execution, browser, coverage, or mutation evidence as applicable; omp_test_gate never executes commands."
      },
      {
        "id": "step-5",
        "text": "Have test-reviewer independently review the plan, test diff, public-behavior coverage, scope, and current evidence without editing files or rerunning tests, and return advisory findings rather than completion permission."
      },
      {
        "id": "step-6",
        "text": "Have the parent reconcile the independent review, report exact commands, exit status, failures, coverage limitations, and unreviewable evidence honestly, and never schedule an automatic repair turn."
      }
    ],
    "scopeNotes": [
      "The user-provided target list defines the intended testing scope.",
      "The planner and reviewer are read-only; the executor may change only authorized tests and fixtures, and production changes require composition with code.dev.",
      "All agent and omp_test_gate conclusions are advisory evidence, not execution authority or completion permission."
    ],
    "skills": [
      "test-driven-development",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "target-to-behavior plan coverage, public-behavior assertions, test-only change scope, command-to-target correspondence, current-revision non-empty execution, exact exit status, browser and coverage evidence when applicable, failure visibility, independent review, and explicit limitations"
    ],
    "riskNotes": [],
    "roles": [
      "test-planner",
      "test-executor",
      "test-reviewer"
    ],
    "delegation": [
      "step-2: test-planner produces the target-to-behavior and evidence plan without editing files or running tests",
      "step-3: test-executor owns bounded test and fixture changes when authoring is in scope",
      "step-4: test-executor runs only host-authorized commands and records fresh execution evidence",
      "step-5: test-reviewer independently audits the plan, test diff, public-behavior coverage, and current evidence without editing files or rerunning tests"
    ]
  },
  {
    "id": "code.review",
    "chooseWhen": "The user asks for a read-only code review, bug audit, regression audit, or diff review.",
    "composeWith": [
      "code.plan",
      "code.debug",
      "code.test",
      "security.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Inspect requested paths and surrounding contracts."
      },
      {
        "id": "step-2",
        "text": "Trace concrete callers and failure paths."
      },
      {
        "id": "step-3",
        "text": "Validate findings against tests or runtime evidence."
      },
      {
        "id": "step-4",
        "text": "Report prioritized findings with file and symbol evidence."
      }
    ],
    "scopeNotes": [
      "Speculative concerns should be labeled as hypotheses."
    ],
    "skills": [
      "diagnose",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "finding-to-code evidence, severity rationale, regression impact, and explicit hypotheses"
    ],
    "riskNotes": [],
    "roles": [
      "explore",
      "reviewer",
      "omp-target-auditor"
    ],
    "delegation": [
      "steps-1-2: explore performs bounded read-only inspection of requested paths, surrounding contracts, callers, and failure paths",
      "steps-3-4: reviewer independently validates and reports patch-anchored findings when the assignment supplies a diff, commit, or pull request",
      "steps-3-4: omp-target-auditor independently validates and reports target-anchored findings when the assignment names an existing bounded target without a diff"
    ]
  },
  {
    "id": "code.build",
    "chooseWhen": "A compiler, type checker, linker, bundler, package, or build command fails and the user wants diagnosis or an authorized repair.",
    "composeWith": [
      "code.debug",
      "code.dev",
      "code.test",
      "code.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Capture the exact build command, target revision, environment, current failure evidence, and the smallest reproducible target."
      },
      {
        "id": "step-2",
        "text": "Inspect the relevant toolchain, configuration, dependency, source, and generated-file boundaries without changing them."
      },
      {
        "id": "step-3",
        "text": "Plan the smallest repair and the focused regression evidence that will distinguish the root cause from downstream symptoms."
      },
      {
        "id": "step-4",
        "text": "When repair is authorized, write or update a focused failing test where a meaningful seam exists, then implement only the planned change."
      },
      {
        "id": "step-5",
        "text": "Rerun the exact failing build command and the smallest relevant test set on the current revision, recording exit status and limitations."
      },
      {
        "id": "step-6",
        "text": "Independently review the semantic diff, build evidence, generated artifacts, dependency changes, and scope before reporting."
      }
    ],
    "scopeNotes": [
      "Do not upgrade dependencies, clear shared caches, regenerate broad artifacts, or modify lockfiles unless the evidence and user-authorized repair require it.",
      "Compose code.debug for diagnosis-only work, code.dev for production changes, and code.test for independently planned test execution."
    ],
    "skills": [
      "build-toolchain-diagnostics",
      "systematic-debugging",
      "test-driven-development",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "exact build command correspondence, current failure evidence, root-cause evidence, focused regression coverage, successful current-revision rerun, semantic diff review, and explicit limitations"
    ],
    "riskNotes": [
      "Toolchain and dependency changes can widen the diff or invalidate reproducibility; keep them evidence-driven and reversible."
    ],
    "roles": [
      "explore",
      "plan",
      "implementation-task",
      "reviewer"
    ],
    "delegation": [
      "steps-1-2: explore collects bounded read-only build, toolchain, configuration, dependency, and source evidence",
      "step-3: plan owns the minimal repair and verification plan without editing files",
      "step-4: implementation-task owns only the authorized focused test and implementation changes",
      "step-6: reviewer independently audits the diff and current build and test evidence"
    ]
  },
  {
    "id": "performance.optimize",
    "chooseWhen": "The user wants a measured performance improvement with a preserved correctness contract rather than an unmeasured cleanup.",
    "composeWith": [
      "code.plan",
      "code.dev",
      "code.test",
      "code.review"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Define the operation, metric, correctness gate, representative input, baseline environment, and bounded search budget."
      },
      {
        "id": "step-2",
        "text": "Measure a reproducible baseline and profile the actual bottleneck before proposing source changes."
      },
      {
        "id": "step-3",
        "text": "Plan one evidence-backed optimization hypothesis at a time with rollback and regression checks."
      },
      {
        "id": "step-4",
        "text": "Implement the smallest authorized variant while preserving the correctness gate and avoiding unrelated refactors."
      },
      {
        "id": "step-5",
        "text": "Repeat the benchmark under the same conditions, run correctness tests, and compare the result against baseline and measurement noise."
      },
      {
        "id": "step-6",
        "text": "Independently review the profiling evidence, semantic diff, correctness results, claimed delta, reproducibility, and rollback."
      }
    ],
    "scopeNotes": [
      "Do not claim a global optimum from a bounded search or accept a faster result that fails the correctness gate.",
      "Load stack-specific performance skills only when they match the measured bottleneck."
    ],
    "skills": [
      "benchmark",
      "benchmark-optimization-loop",
      "test-driven-development",
      "verification-before-completion"
    ],
    "qualityChecks": [
      "reproducible baseline, profile-backed bottleneck, bounded hypothesis, same-condition comparison, correctness preservation, repeated performance delta, semantic diff review, and rollback evidence"
    ],
    "riskNotes": [
      "Benchmarks can mutate data, consume substantial compute, or mislead when environments differ; bound cost and record conditions."
    ],
    "roles": [
      "explore",
      "plan",
      "implementation-task",
      "reviewer"
    ],
    "delegation": [
      "steps-1-2: explore gathers bounded read-only baseline, benchmark, profile, and relevant source context",
      "step-3: plan owns the measurable optimization and rollback plan without editing files",
      "step-4: implementation-task owns only the selected bounded optimization variant and focused tests",
      "step-6: reviewer independently audits the baseline, profile, diff, correctness, claimed delta, and reproducibility"
    ]
  }
];
