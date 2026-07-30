const VISUAL_AGENT_SCOPE_NOTES = [
  "Visual-stage chain: designer owns the design or source revision; task owns rendering, compilation, and optional imagegen execution; visioner independently and read-only reviews the current render or layout. Main authorizes external-effect decisions during initial setup and accepts the final delivery. Non-visual stages keep their existing owners and are not assigned to designer or visioner merely because the workflow is visual.",
  "When designer is unavailable, record the precise unfulfilled design checkpoint with the permitted `fallback=Agent availability`; Main must not silently self-substitute or claim designer evidence. When visioner is unavailable, record the missing independent current-revision visual evidence; source inspection, compile success, designer self-review, or Main self-review is not visioner evidence. These are visible limitations, never a plugin gate, router, fixed dispatch, completion condition, or automatic loop."
];

export const operationWorkflows = [
  {
    "id": "omp.plugin",
    "chooseWhen": "The target is an OMP plugin, the omp-enhancer monorepo, or an isolated self-development fixture: workflows, Skills, Agents, prompts, reminders, hooks, config assets, packaging, or E2E.",
    "composeWith": [
      "release.publish"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Establish acceptance criteria, architecture invariants, repository instructions, canonical source and generated outputs, unrelated dirty worktree changes, plugin boundaries, and live installed state."
      },
      {
        "id": "step-search-local",
        "text": "Main writes a bounded evidence brief and delegates search local code to scout — entry points from fast repository search, callers, consumers, adjacent tests, configuration, and source-vs-generated-vs-packaged-vs-installed anchors; Main integrates the returned evidence and performs no broad repository search itself"
      },
      {
        "id": "step-search-external",
        "text": "When current library, toolchain, API, design, failure, or performance practice could change the decision and network is not forbidden, Main delegates one bounded external pass to librarian (official documentation first, bounded community experience second), keeps external advice separate from local evidence, and records version and applicability; queries must not contain private code, secrets, or PII"
      },
      {
        "id": "step-plan",
        "text": "Main writes a frozen planning brief — requested outcome, mutation authority, acceptance criteria, integrated evidence anchors, slice boundaries, and evidence bar — and delegates to the plan Agent the full detailed implementation and evidence plan: dependency-ordered parallel waves of vertical slices with IDs, acceptance targets, dependencies, exact files and non-overlapping write sets, public test seams, exact focused commands, expected valid RED, minimum production boundaries, required Skills, focused tests, shared-generator boundaries, isolated installed E2E scenarios, E2E event evidence, and the release boundary, integration points, returned evidence, and the draft's own challenge findings; Main authors no plan detail beyond the brief. Main may dispatch plan again for a finer-grained sub-plan when a slice needs deeper decomposition before production mutation; each plan pass receives Main's updated frozen brief."
      },
      {
        "id": "step-plan-review",
        "text": "The plan Agent's draft carries its challenge findings; Main dispatches reviewer to independently audit the plan's parallel waves, exclusive write sets, dependency accuracy, test seams, and evidence boundary. Main may call plan again with reviewer findings integrated into an updated brief; repeated plan-reviewer cycles are allowed while plan content materially changes, never on unchanged text; a generator that rewrites a shared output set belongs to one downstream integration slice after its source dependencies, never to parallel sibling slices"
      },
      {
        "id": "step-plan-disposition",
        "text": "Main records each accepted, rejected, and unresolved reviewer plan finding, rebases only affected TODO rows, and freezes complete assignments with exclusive write ownership, exact evidence return, and no versioning or publication authority."
      },
      {
        "id": "step-task-batch",
        "text": "In the same native task tasks[] batch for a wave, Main submits all runnable independent vertical slices; dependency-bound slices wait for their canonical integration anchor, while a single safe slice remains one task. Behavior/source tasks keep exclusive source and test writes, and one later shared-generation integration task owns any generator that rewrites shared outputs."
      },
      {
        "id": "step-task-tdd",
        "text": "Behavior/source tasks own one complete vertical slice: mutate the public behavior test first, prove a real valid RED with the focused command, make the minimal canonical implementation, rerun the same command for GREEN, refactor only while green, and return the bounded diff and exact evidence. A downstream shared-generation task runs the shared generator exactly once after all source dependencies are integrated and returns generation, check, and parity evidence without fabricating a RED or claiming behavioral TDD."
      },
      {
        "id": "step-verify",
        "text": "After all task deliveries, Main integrates wave results, runs targeted tests, and performs check-only parity and no-diff inspection of generated outputs; Main must not rerun the shared generator. It then runs applicable typecheck or build, package and marketplace checks, and proportionate root validation on the current revision."
      },
      {
        "id": "step-e2e",
        "text": "When runtime, workflow, Skill, Agent, prompt, lifecycle, tool, packaging, or installed behavior changed, Main delegates the isolated installed OMP E2E pilot and relevant scenarios to task with a frozen fixture, model, thinking level, tool set, evaluator, and timeout; task returns event evidence and Main classifies model behavior separately from provider, deadline, runner, and project-command failures"
      },
      {
        "id": "step-review",
        "text": "The native reviewer independently reviews the bounded semantic diff and supplied evidence covering the complete integrated change, including Main-authored edits, without a project read or command, returning concrete unanswered findings without edit, repair, or completion authority."
      },
      {
        "id": "step-repair",
        "text": "Main validates every reviewer result; for each material supported finding, Main gives task a bounded repair assignment, task returns fresh evidence; Main integrates and runs focused verification, and allows at most one fresh reviewer pass over the materially changed diff; this path is never automatic and never self-repeats."
      },
      {
        "id": "step-report",
        "text": "Report exact commands, current evidence, plan and reviewer dispositions, task deliveries, limitations, generated outputs, and untouched unrelated changes; perform release, sync, push, publish, or upgrade only when explicitly requested."
      }
    ],
    "scopeNotes": [
      "Publishing is a separate externally visible action.",
      "A missing Agent, Skill, command, or E2E dependency is an explicit limitation, not permission to invent evidence or continue a host session.",
      "A documentation-only or mechanical metadata change does not require a fabricated RED or live model run; record the cheapest relevant contract evidence instead.",
      "Slice count follows actual independent vertical work, exclusive write ownership, dependency waves, and native capacity; do not manufacture parallelism or separate a test from its production behavior.",
      "A generator that rewrites a shared output tree is an exclusive downstream integration slice, not a command for multiple parallel source slices.",
      "If task is unavailable, capacity constrained, or an assignment cannot be made safe, Main records the limitation and uses only a host-authorized direct fallback, if any; this workflow is not a gate, router, fork mandate, or completion controller.",
      "Main never self-induces a fallback by skipping brief, input, or checkpoint preparation",
      "The named audit Agent reviews the complete change regardless of who wrote the code — task slices, integration edits, and Main-authored code alike; the audit and plan-audit checkpoints fall back only when the named Agent is unavailable, and Main records that concrete unavailability on the affected row instead of proceeding unreviewed."
    ],
    "skills": [
      "code-development"
    ],
    "qualityChecks": [
      "acceptance-to-file coverage, explicit plan-review disposition, parallel vertical slices with exclusive write ownership, behavior/source task-owned RED-before-production and focused GREEN evidence, one-shot shared generation with check-only parity and no-diff inspection, current package and marketplace consistency, isolated installed E2E when runtime behavior changed, bounded review reconciliation, installed-runtime parity, dirty-tree containment, and advisory-only lifecycle behavior, author-neutral reviewer audit of the complete change including Main-authored edits, unavailability-only plan-review and code-review fallbacks recorded concretely, reviewer-audited plan output before production mutation, Main-authored edit coverage in reviewer audit"
    ],
    "riskNotes": [
      "Prompt, lifecycle, model-behavior, packaging, and installed-runtime surfaces can drift across source, generated, packaged, and live states and require isolated evidence.",
      "Live model behavior is stochastic, so one pass never guarantees stable workflow compliance; deterministic contracts remain the regression boundary."
    ],
    "roles": [
      "plan",
      "task",
      "reviewer",
      "scout",
      "librarian"
    ],
    "delegation": [
      "step-search-local: scout owns the bounded local evidence pass and returns exact anchors distinguishing repository source from generated, packaged, installed, or runtime truth",
      "step-search-external: librarian owns one bounded external pass over official documentation and community experience and returns versioned, applicability-tagged leads",
      "step-plan: plan drafts the complete implementation and evidence plan from Main's frozen brief, including its own challenge findings, without editing files",
      "step-plan-review: reviewer independently audits plan's supplied complete parallel plan — write sets, dependencies, assignment inputs, test seams, local and external anchors, and evidence boundary — and returns findings; Main may dispatch plan again with reviewer findings integrated, while plan content materially changes",
      "step-task-batch: task receives all runnable independent vertical slices for a wave in the same native tasks[] batch with exclusive source and test ownership; one dependency-ordered shared-generation task owns shared generated outputs",
      "step-task-tdd: each behavior/source task owns its complete vertical RED -> GREEN -> REFACTOR slice and returns the public-behavior test, canonical implementation, bounded diff, and exact command evidence; the downstream shared-generation task runs the shared generator exactly once and returns generation, check, and parity evidence without fabricating a RED",
      "step-e2e: task runs the isolated installed E2E pilot without publish, upgrade, or external contact and returns event-log evidence; Main evaluates",
      "step-review: reviewer independently audits only the bounded semantic diff and supplied evidence without project reads, commands, edits, repair, or completion authority",
      "step-repair: task receives only a Main-validated supported finding as a bounded repair and returns fresh evidence; Main integrates and dispatches at most one fresh affected reviewer pass",
      "step-report: Main retains exclusive versioning, publication, synchronization, release-boundary, and final verification ownership"
    ]
  },
  {
    "id": "security.review",
    "chooseWhen": "The task explicitly reviews security trust boundaries, vulnerability impact, or remediation.",
    "composeWith": [
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
    "catalogSkills": [
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
      "ecc-security-reviewer"
    ],
    "delegation": [
      "step-2: ecc-security-reviewer traces the concrete trust boundaries, callers, sinks, exploit preconditions, and demonstrated impact",
      "step-5: ecc-security-reviewer makes one fresh challenge only when Main supplies materially changed high-impact findings or evidence",
      "step-5: the parent independently validates findings and preserves authorization boundaries"
    ]
  },
  {
    "id": "design.visual",
    "chooseWhen": "Independent UI/layout/interaction/static visual work/output.",
    "composeWith": [
      "diagram.tikz",
      "slides.generate",
      "slides.modify"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Main inspects the requested scope, existing visual context, implementation boundary, and constraints."
      },
      {
        "id": "step-2",
        "text": "Choose one bounded visual direction from the supplied context and constraints."
      },
      {
        "id": "step-3",
        "text": "Create or refine one design or source revision without taking ownership of non-visual stages."
      },
      {
        "id": "step-4",
        "text": "Render one identified current revision, then reconcile that revision against scope and implementation constraints."
      },
      {
        "id": "step-5",
        "text": "Independently and read-only review the current render or layout for hierarchy, spacing, typography, responsiveness, accessibility, and states."
      },
      {
        "id": "step-6",
        "text": "For each visual review finding, produce one bounded new design or source revision, rerender the changed current revision, then the fresh rerenders are reviewed at most once; do not review an unchanged artifact and report remaining visual defects."
      }
    ],
    "scopeNotes": [
      ...VISUAL_AGENT_SCOPE_NOTES,
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
      "designer",
      "task",
      "visioner"
    ],
    "delegation": [
      "step-2: designer owns the bounded visual direction",
      "step-3: designer owns the design or source revision while preserving the requested scope",
      "step-4: task renders one identified current revision; designer reconciles scope",
      "step-5: visioner independently and read-only reviews that current render or layout",
      "step-6: designer applies visioner findings, task rerenders, and visioner reviews only fresh rerenders"
    ]
  },
  {
    "id": "release.opensource",
    "chooseWhen": "The user wants to prepare a private or internal project as a sanitized, documented public-release candidate in a separate staging area.",
    "composeWith": [
      "security.review",
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
        "text": "Deliver the staging path, transformation ledger, sanitization verdict, test evidence, limitations, and review findings; apply release.publish only when it was selected in PLAN for an explicitly authorized public target."
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
      "code-development"
    ],
    "catalogSkills": [
      "opensource-pipeline",
      "safety-guard"
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
        "text": "Under the user authorization copied verbatim into the assignment, task performs the authorized commit, push, publish, deploy, version, upgrade, or synchronization and returns exact command evidence; Main retains exclusive release authority and performs no release mutation itself"
      },
      {
        "id": "step-4",
        "text": "Independently verify the remote or installed result."
      },
      {
        "id": "step-audit",
        "text": "reviewer independently audits the bounded release diff and command evidence without project reads or commands, returning findings without repair or completion authority"
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
      "finishing-a-development-branch"
    ],
    "qualityChecks": [
      "target and version correspondence, successful preflight, independent post-mutation verification, and exact final state"
    ],
    "riskNotes": [
      "Use host approval and the user-authorized target for irreversible or externally visible actions."
    ],
    "roles": [
      "task",
      "reviewer"
    ],
    "delegation": [
      "step-2: task owns a bounded read-only preflight slice and returns exact evidence without changing release state",
      "step-3: task performs the authorized release mutation under the user authorization copied verbatim into the assignment; Main retains exclusive release authority",
      "step-4: task owns a bounded read-only post-mutation verification slice for the exact remote, marketplace, deployed, or installed state",
      "step-audit: reviewer independently audits the bounded release diff and command evidence without project reads or commands",
      "step-5: the parent reconciles the verified target and reports the exact final state"
    ]
  }
];
