# Skill and workflow conflict audit

Initial audit: 2026-07-19; second, third, and fourth full scans plus the fifth discovery-organization pass: 2026-07-20

## Outcome

The 2026-07-19 marketplace baseline contained 313 Skill entrypoints. All 313
were enumerated and split among three human-review owners; every entrypoint was
classified and high-risk matches were read in context. The 2026-07-20 scan
confirmed that the current entrypoint count remains 313. The inventory baseline
is structurally complete:

- 313/313 have frontmatter names;
- 313 names are globally unique;
- the 29 workflow cards contain 70 Skill-candidate occurrences and 47 unique
  candidate names; all resolve. Of these, 31 occurrences / 22 unique candidates
  are top-level exact `D` PLAN/NOW URIs, while 39 occurrences / 25 unique
  candidates across 14 workflows are index-enumerated nested ECC exact `C`
  PLAN/NOW URIs;
- all 255 ECC catalog URIs resolve to nested guides;
- all 447 packaged Skill Markdown resources were scanned; every navigation link
  to a real resource inside the same packaged Skill now uses an exact
  `skill://...` URI, and all 388 distinct exact backticked literal Skill URIs
  resolve to real Skill roots or nested resources;
- all workflow Agent candidates resolve to a packaged plugin Agent, including
  `plan`, or to the allowed OMP native roles `task`, `reviewer`, and `designer`;
- no supported `/test` command, retired gate Skill, `block: true`, or
  `continue: true` lifecycle contract remains.

The audit found real semantic conflicts, but it did not classify ordinary words
such as “gate”, “router”, “block”, or “loop” as failures. Domain CI thresholds,
payment confirmation, dangerous network-config rejection, bounded monitoring,
and evidence requirements are not OMP lifecycle gates.

`313/313` is an enumeration and review-coverage baseline, not proof that a
semantic scan can never reveal another conflict. The 2026-07-20 adversarial
second scan found additional staged-loading, committed-PLAN, and authority
ambiguities after the first follow-up. The verified repairs are recorded below;
this document limits its conclusion to the listed source-and-test-backed repairs.

## Method and reproducible baseline

The review groups were disjoint:

1. all 28 Writing Helper Skills, plus writing-related candidate cross-checks;
2. 25 top-level non-ECC Config Skills and four Fact Checker Skills;
3. the ECC adapter and all 255 nested ECC Skills, about 63.5k lines.

Machine scans checked frontmatter, global names, workflow candidates, Agent
names, literal `skill://` URIs, generated catalog targets, registered commands,
retired gate names, stale Agent names, hard-coded host interfaces, fixed
fanout, automatic repair/continuation phrases, and external-effect language.
Human review then classified every high-risk match against the current v19
workflow and native-authority contracts.

Inventory accounting follows package content, not an unrestricted physical-tree
walk. The three plugin package manifests that include `skills` contain 447
Markdown files in `npm pack --dry-run --json`, and the tracked-file cross-check
also returns 447. A raw recursive walk returns 448 only because
`skill-comply/.pytest_cache/README.md` is present locally; that ignored test
cache is neither tracked nor packed. Both full-inventory tests now scan only
package-declared Skill roots and exclude VCS, dependency, Python bytecode, and
test-cache artifact directories. A fixture proves that adding the cache README
does not change the reviewed inventory.

The preserved pre-repair aggregate recorded before mutation was:

```text
515616b67eb8a419549fabdc4b7eb1264c3bd7fd2afa32b87167cbddb50c72bc
```

No pre-repair tree snapshot or per-file manifest was retained, so that historical
digest cannot be reproduced from the current checkout. The hashing method was:

```bash
find plugins -name SKILL.md -type f -print0 \
  | sort -z \
  | xargs -0 sha256sum \
  | sha256sum
```

This hashes the ordered `sha256sum` lines, which include each relative path and
the digest of its exact file bytes. The historical post-repair checkpoint
aggregate is reported below; it is not presented as the current tree digest.

## Disposition rules

The sections below assign the exceptional dispositions. Every entry in the full
manifest that is not named in an exception section retains its 2026-07-19
baseline `ALIGNED` disposition based on its group's human review, not merely
because a regex failed to match. Later exception sections take precedence, and
the baseline is not perpetual clearance from future findings.

- `REPAIR_THIS_TURN`: directly affected the authorized staged workflow,
  subagent, Skill-loading, or task-owned TDD behavior, was repaired, and now
  has a path-specific regression seam.
- `RESOLVED_SECOND_SCAN`: the 2026-07-20 finding has both a current Skill-source
  repair and a focused regression test. A prose proposal alone does not qualify.
- `PROPOSED`: a confirmed defect or portability/authority risk outside the
  bounded workflow-stability repair; document it but do not mutate it now.
- `CHILD_LOCAL_LABEL`: the domain method is compatible, but an explicit actor
  boundary would reduce ambiguity; add only with an independently failing
  contract.
- `CONDITIONAL_TARGET_SYSTEM`: valid only when the user explicitly asks to
  build or configure that external/autonomous target system.
- `DOMAIN_CONSTRAINT`: intentional safety, evidence, CI, payment, or monitoring
  behavior that must remain.

## Resolved direct conflicts

Every row in this table has been implemented and covered by focused tests. The
last column preserves the bounded repair intent; it is no longer a proposal.

| Skill | Conflict | Implemented resolution |
|---|---|---|
| `ecc-skill-catalog` | A loaded adapter could be counted as a completed catalog check without reading `catalog.md`; a workflow or Agent was treated as a domain Skill. | Fix the generator source, then regenerate once. |
| `writing-markdown-helper` | Explicit “without subagents” and “Default Direct Workflow” contradict the `writing.en` writer/checker chain. | Make it the assigned proposal-only writer-child method; Main alone applies an authorized patch. |
| `zh-writing-markdown-helper` | Direct-work wording lacks the composed writer/checker and parent boundary. | Add the same Chinese proposal-only writer-child boundary. |
| `writing-review` | “Review target directly” and same-pass editing blur child method versus Main orchestration. | Bind prose revision to a proposal-only writer delivery; independent checker remains separate and Main owns file mutation. |
| `zh-writing-review` | Same actor ambiguity in the Chinese review method. | Bind the revision proposal to `zh-writer`; Main owns findings and any authorized file change. |
| `zh-writing-polish` | Local polish can be mistaken for the whole writing workflow. | Mark it as an assigned proposal-only writer-child method whose result is applied only by Main. |
| `writing-skills` | Dangling resources, hard “No exceptions” gate, nonexistent `TodoWrite`, and default commit/push. | Rewrite compactly using the current skill-creator method. |
| `deepseek-tool-calling` | `alwaysApply: true` and a fixed tool schema conflict with on-demand Skills and current exposed schemas. | Make it on-demand and subordinate examples to the live tool contract. |
| `deep-research` | Fixed three Claude Task agents conflict with dynamic Available Agents and capacity. | Use bounded independent evidence lanes chosen by Main. |
| `gan-style-harness` | Says Main directly owns RED/GREEN slices. | Native `task` owns complete vertical TDD slices; Main integrates/reviews. |
| `mle-workflow` | Same Main-owned production TDD conflict. | Use the `code.dev` task-owned TDD boundary. |
| `santa-method` | Fixed two reviewers, both-PASS ship gate, and automatic review-repair respawn loop. | Dynamic bounded review; findings advisory; no automatic loop. |
| `council` | Fixed three-person fanout regardless of capacity or task structure. | Main chooses available independent perspectives and width. |
| `click-path-audit` | One Agent per page and a fixed eight-Agent plan. | Preserve dependencies but let Main size independent page slices. |
| `team-builder` | Uses `claude agents`, `.claude/agents`, `Agent`, and `general-purpose` as OMP truth. | Use current dynamic Available Agents and native `task`. |
| `skill-stocktake` | Fixed 20-Skill batches and hard-coded general-purpose Agent. | Use capacity-aware independent batches. |
| `rules-distill` | Requires one hard-coded Agent per cluster and names nonexistent local Skills. | Use dynamic batches and explicitly fictional fixture names. |
| `search-first` | `.claude` paths and `Agent(subagent_type=...)` can override current inventory. | Use native inventory, exact loaded catalog URIs, and native `task`. |
| `strategic-compact` | Assumed `TodoWrite`, `/compact`, and a Claude hook schema were live host contracts. | Use native TODO only when exposed and label compaction/hook instructions as a separately authorized target-runtime setup. |
| `autonomous-agent-harness` | Named `TodoWrite` as the current session task tool inside an otherwise conditional target-system guide. | Defer to native TODO when exposed; preserve the existing explicit-autonomy boundary. |
| `knowledge-ops` | Assumed `TodoWrite` and defaulted memory, tracker, commit, and push effects without target-specific authorization. | Defer to exposed capabilities, require explicit authorization per write/external effect, and make quality checks advisory. |
| `tdd-workflow` | Duplicated the parent code lifecycle, imposed a universal coverage threshold, and automatically staged and created multiple commits. | Make it a compact task-child RED/GREEN evidence guide under `code-development`; Git effects require explicit authorization. |
| `ralphinho-rfc-pipeline` | Created a second fixed orchestration, merge queue, rebase rule, and automatic retry path. | Retain dependency-aware unit fields while Main owns native TODO, dynamic `task` delegation, integration, and any separately authorized Git effects. |
| `product-lens` | Named three nested Skills as unregistered slash commands. | Use exact Skill identities and require ordinary select/load behavior. |
| `videodb` | Hard-coded host tool names and lacked a boundary for upload, capture devices, installation, and third-party retention. | Defer to live schemas and require explicit source, target, and effect authorization. |
| `claude-devfleet` | Generic parallel tasks activated an external fixed-width dispatcher with unattended dispatch and merge. | Make DevFleet an explicitly requested target integration; native `task` remains the ordinary default and all external effects remain Main/user-owned. |
| `dmux-workflows` | Generic parallel tasks activated fixed panes, external sessions, worktrees, installation, and branch merging. | Make dmux an explicitly requested target integration with capacity-aware units and effect-specific authorization. |
| `slides-storyline` | Required a second user approval before frame authoring even when the supplied brief was complete. | Commit a working outline with explicit assumptions; ask only for a materially blocking choice. |
| `latex-beamer-slides` | Used designer/visioner verdicts as completion and conversion permission and automatically ran up to three repair/review rounds. | Keep one advisory review handoff; a supported repair becomes a new Main TODO checkpoint with at most one fresh affected review. |
| `svg-flowchart` | Automatically redispatched designer repairs and required zero major findings before completion. | Keep deterministic checks and optional visual evidence while Main owns finding disposition and completion. |

The four writing Agent prompts are not Skill entries but are part of the same
repair. Writers expose only `read`, `grep`, and `glob`; they must not invoke or
replace checkers and always return a complete proposal or bounded diff, even
when the assignment authorizes file mutation. Checkers have no `write` or
`edit`, stay read-only and report-only in-band, and retain `web_search` only for
host- and user-authorized evidence verification. Main alone decides and performs
an authorized file change or report persistence. Every child consumes only the
frozen Skills copied from its committed assignment and does not run a second
workflow/Skill discovery, selection, or load pass.

The later full-inventory pass also closed conflicts that were initially only
proposed:

- `plain-chinese-writing` is a Chinese-prose method selected under
  `writing.zh`, not a mandatory wrapper for every Chinese reply.
- `research-phase-navigation` is a Main-selected reference checklist, and
  `research-storyline`, `research-relatedwork-summarizer`, and
  `research-socratic` are child-local methods with no recursive delegation or
  implicit `.pi` writes. When one is composed into a writer assignment, the
  writer remains proposal-only; Main or an explicitly capable generic `task`
  owns separately authorized effects.
- `writing-mad-writer`, `zh-writing-mad-writer`,
  `writing-state-machine`, and `zh-writing-state-machine` are child-local
  writer methods. Their inline checks do not replace the independent checker;
  they do not fabricate placeholder data, use the network implicitly, or
  mutate files in any writer assignment. They always return proposals, and Main
  owns any authorized persistence.
- `using-git-worktrees`, `finishing-a-development-branch`, `prototype`, and
  `spike` now separate worktree, install, network, cleanup, Git, scratch, and
  production-TDD authority.
- `marketing-campaign` and `benchmark` retain their domain methods without
  fixed deliverable/fanout counts, invented commands, automatic publishing, or
  a second completion controller.
- `blueprint` and `agentic-engineering` now supplement the current
  Main -> `plan` -> native `task` TDD -> Main review -> native `reviewer`
  lifecycle. `autonomous-loops` is a compact legacy reference and
  `continuous-agent-loop` applies only to an explicitly requested external
  autonomous target.
- `opensource-pipeline` uses canonical assignment metadata and bounded
  publication authority; `deepseek-tool-calling` defers to the live schema;
  the Remotion chart resource link now resolves.

## First follow-up repairs (2026-07-20)

The first follow-up pass converted the following reviewed findings into explicit
current-workflow boundaries and added aggregate regression seams. For the items
listed in this section, loading the Skill does not by itself route the current
OMP session, create a completion gate, expand native permission, or imply an
external effect.

Writing and directly visible Config repairs:

- `research-bogus-data` now permits only symbolic placeholders and an evidence
  acquisition plan; synthetic measurements cannot enter the fact chain.
- `research-literature` and `research-experiment` separate evidence collection,
  network use, and requested file output; unknown baselines, metrics, datasets,
  and results remain unresolved or explicitly hypothetical.
- `improve-codebase-architecture` and `grill-with-docs` default to read-only
  response delivery; HTML, CDN, browser, ADR, and `CONTEXT.md` effects require
  the user request and current native authority. The unregistered command form
  was removed.
- `caveman` is a task-scoped presentation method, not a persistent command or
  a way to override workflow, Skill, schema, safety, or evidence contracts.
- `go-testing` follows the repository's framework and behavioral seams and
  does not install `testify` or manufacture one test file per source file.
- `docker-compose` derives network, timezone, volume, port, and resource choices
  from the repository and deployment requirements; execution, registry access,
  and image pulls remain separately authorized effects.

Nested ECC repairs:

- `context-budget`, `continuous-learning`, `continuous-learning-v2`,
  `configure-ecc`, `agentic-os`, `plankton-code-quality`, `ck`, `hookify-rules`,
  `ecc-guide`, and `eval-harness` label Claude paths, hooks, slash commands,
  model tiers, routers, SHIP rules, and auto-fix behavior as instructions for an
  explicitly requested external target, never as current OMP authority.
- `skill-scout` separates read-only discovery from authorized installation or
  external acquisition; `repo-scan` no longer duplicates packaged Skills into
  `~/.claude/skills`.
- `visa-doc-translate` does not treat an input path as install, command, write,
  or certification authority. `nutrient-document-processing` makes third-party
  upload, API keys, sensitive data, signatures, and writes explicit effects.
- `browser-qa`, `canary-watch`, and `design-system` separate inspection from
  browser interaction, form submission, network, webhook, install, and file
  mutation effects.
- `github-ops`, `jira-integration`, `project-flow-ops`,
  `customer-billing-ops`, and `social-publisher` separate read-only inspection
  from comments, transitions, releases, merges, refunds, cancellation, outbound
  messages, connection, upload, scheduling, and publication.
- `skill-comply` makes command execution and report writes explicit effects.
  `agent-payment-x402` identifies external package or repository names as
  non-local Skill URIs while preserving its fail-closed payment safety rules.

## Second full-scan findings and verified repairs (2026-07-20)

The second scan used three current-contract invariants:

1. Main selects a visible supporting method in the initial committed
   `WORKFLOW PLAN`. After that PLAN, Main may load another method only through
   an exact `skill://ecc-skill-catalog/...` URI that an already loaded source
   explicitly reveals; a bare Skill name is not a late-load instruction.
2. A loaded Skill consumes the committed PLAN, loaded resources, READY record,
   and TODO. It does not reroute, replace the PLAN, create a second PLAN, or add
   its own workflow, Agent, TODO row, dispatch, retry, or completion decision.
3. Current OMP tools, sandbox, approvals, native permissions, and Main's
   external-effect decisions remain authoritative. Target-system safety rules
   may govern their target artifact or deployment, but never the OMP session.

Every row below is `RESOLVED_SECOND_SCAN`: the named Skill source and the named
focused test both exist in the current tree.

| Skill or group | Second-scan conflict | Verified current resolution | Focused evidence |
|---|---|---|---|
| `flox-environments` | Its trigger text implied mandatory selection, sandbox escape, automatic installation, manifest writes, commit, and push. | It is an optional method selected by Main. Loading it grants no route or permission; installation, writes, commands, commit, and push each require explicit authorization for that exact effect plus current native permission. | `ecc-high-risk-skill-contract.test.js` |
| `openclaw-persona-forge` | Relative reference links, optional image generation, output writes, and retry wording could bypass staged loading or effect authority. | The loaded source reveals its six references through exact same-namespace `skill://ecc-skill-catalog/openclaw-persona-forge/references/...` URIs. Image generation also requires an exact image Skill URI in the committed PLAN and loading before READY; image or file effects require explicit user authorization and native permission. | `ecc-high-risk-skill-contract.test.js` |
| `prompt-optimizer` | It could act as a second router by selecting workflows, Skills, Agents, and TODO checkpoints for an underspecified task. | It runs only after READY against an existing committed delegated row, copies Primary, Add-ons, workflow IDs, Skill URIs, Agent, step, skills, and checkpoint verbatim, and refines only the bounded assignment body. | `ecc-high-risk-skill-contract.test.js` |
| `motion-advanced` | Bare “requires/use `motion-foundations` first” wording was an ambiguous late-load command. | The source explicitly reveals `skill://ecc-skill-catalog/motion-foundations/SKILL.md` in a `RESOURCE EXTENSION`; it never late-loads a bare name. | `ecc-high-risk-skill-contract.test.js` |
| `git-workflow` | Reference examples could be read as authority for destructive or remote Git actions. | Examples are data only. Checkout, merge, rebase, reset, amend, commit, tag, delete, and push each require separate explicit user authorization plus native permission; without commit or push authority the method stops after local evidence. | `ecc-high-risk-skill-contract.test.js` |
| `automation-audit-ops`, `ecc-tools-cost-audit`, `email-ops`, `finance-billing-ops`, `messages-ops`, `terminal-ops`, `article-writing`, `investor-outreach`, `crosspost`, and `production-audit` | Bare “pull/run/use X first”, hand-off, Skill-stack, and related-Skill language could silently compose a new method after PLAN. | Main selects visible supporting methods in the initial PLAN. A later extension is allowed only when the loaded source explicitly reveals an exact same-namespace `skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI. Each Skill states that it cannot reroute, emit a replacement PLAN, or auto-load another Skill, and every revealed URI resolves. | `ecc-late-loaded-method-boundaries.test.js` |
| `prediction-market-oracle-research` | “Run the security Skill” phrasing could select a regulated overlay after the committed PLAN. | The security overlay is the exact URI `skill://ecc-skill-catalog/llm-trading-agent-security/SKILL.md`, declared in PLAN when visible or loaded only through an ordinary source-revealed `RESOURCE EXTENSION`. | `ecc-regulated-overlay-contract.test.js` |
| `hipaa-compliance` | Bare “use `healthcare-phi-compliance`” wording could reselect the workflow or change the committed PLAN. | Main selects the exact `skill://ecc-skill-catalog/healthcare-phi-compliance/SKILL.md` URI in PLAN; the overlay neither reselects a workflow nor changes that PLAN. | `ecc-regulated-overlay-contract.test.js` |
| `data-scraper-agent` | Its description promised fully automatic, free current-session operation while examples included scheduling, network, storage, writes, and commits. | It is guidance for an explicitly requested external target system. Inspection, planning, and read-only review remain distinct; installation, configuration, commands, network, writes, publication, mutation, and other effects require exact user authorization plus native permission. | `ecc-external-system-boundaries.test.js` |
| `healthcare-eval-harness` | “Blocks deployments” could be mistaken for an OMP completion gate. | It designs or reviews an explicitly requested external target CI. Patient-safety checks may block that target deployment only; they do not block, continue, or complete the OMP session, and target effects retain user/native authority. | `ecc-external-system-boundaries.test.js` |

The secure extension protocol still accepts only exact `skill://` URIs exposed
by a visible selection or an already loaded source. The later full-tree scan
converted every relative link that targets a real packaged same-Skill resource;
relative links now remain only inside illustrative project examples whose target
files are intentionally absent from the Skill package. Main never guesses or
traverses those examples as Skill loads.

## Third full-scan findings and verified repairs (2026-07-20)

The third scan re-enumerated all 313 entrypoints after the prompt compiler and
second-scan changes. It separately checked entrypoint metadata, active prose
outside code fences, same-namespace resources, cross-Skill navigation, external
effects, and orchestration ownership. The scan found additional conflicts that
the earlier URI-existence test could not detect: a URI may resolve while its
surrounding prose still asks a loaded Skill to become a second router.

Every item below has a current source repair and a focused regression test:

| Skill or group | Third-scan conflict | Verified current resolution | Focused evidence |
|---|---|---|---|
| `agent-architecture-audit` | Mandatory wording, Claude `tools` metadata, and a proposed code gate could supersede the committed workflow. | It now audits an existing PLAN, READY, and parent TODO; findings and repairs are advisory, and Main/native OMP retain Agent, concurrency, permission, integration, and completion authority. | `ecc-orchestration-advisory-boundaries.test.js` |
| `parallel-execution-optimizer` | It could replace the parent TODO, launch a second orchestration layer, or treat worktrees, background jobs, and deploys as implied effects. | It returns dependency-lane advice only. Main selects Agents and width, and every host configuration, worktree, background-process, or deployment effect retains exact user authorization and native permission. | `ecc-orchestration-advisory-boundaries.test.js` |
| `motion-patterns`, `content-engine`, `connections-optimizer`, `ito-market-intelligence`, `ito-trade-planner`, `social-graph-ranker`, `x-api`, and `agent-introspection-debugging` | Bare supporting-Skill names and “use next” prose could reselect or auto-load methods after PLAN. | Each supporting method is either an initial PLAN candidate or an exact same-namespace `RESOURCE EXTENSION`; the loaded Skill explicitly cannot reselect a workflow or become a second router. | `skill-resource-composition-contract.test.js` |
| `angular-developer`, `remotion-video-creation`, `videodb`, `tinystruct-patterns`, `brand-voice`, `prototype`, `grill-with-docs`, and `improve-codebase-architecture` | Active relative resource links invited path traversal instead of exact resolver use. | Active method resources are exposed as exact same-namespace `skill://...` URIs, and every URI resolves without leaving its Skill root. | `skill-resource-composition-contract.test.js` |
| `react-patterns`, `react-performance`, `react-testing`, and `token-budget-advisor` | Relative links crossed into another Skill and could be mistaken for a legal late load. | Cross-Skill methods are exact initial-PLAN candidates only; the loaded source cannot traverse or load them itself. | `skill-resource-composition-contract.test.js` |
| `agent-eval`, `eval-harness`, `skill-comply`, `benchmark-optimization-loop`, `data-throughput-accelerator`, `latency-critical-systems`, `recursive-decision-ledger`, and `blender-motion-state-inspection` | Claude-specific `tools:` frontmatter could be read as permission or an available tool surface. | The metadata was removed; the current native tool schema and permissions remain authoritative. | `ecc-skill-entry-authority-contract.test.js` |
| `continuous-learning`, `remotion-video-creation`, `recsys-pipeline-architect`, and `java-coding-standards` | Trigger descriptions used broad mandatory or automatic language. | Descriptions now state positive, task-local selection conditions and do not route all matching requests. | `ecc-skill-entry-authority-contract.test.js` |
| `agent-eval`, `recsys-pipeline-architect`, `codebase-onboarding`, `exa-search`, `fal-ai-media`, `laravel-plugin-discovery`, and `configure-ecc` | Installation, host configuration, network, upload, generated-file, cleanup, or cost-bearing examples could imply effect authority. | Each effect requires explicit user authorization for the exact target and effect plus current native permission; examples remain reference data. | `ecc-skill-entry-authority-contract.test.js` |

The same pass consolidated the workflow index's duplicated defaults, match
rules, and handoff prose. Later discovery work expanded the index with exact
`D`/`C` URI evidence, so earlier byte snapshots and limits are no longer current.
The focused workflow-index test is the size authority and checks the generated
artifact against its configured budget while retaining the staged load, soft
compiler, fallback, writing actor, and native-authority contracts. Exact bytes
remain generation-time evidence, not durable acceptance text. This is a
prompt-complexity budget, not a new runtime router or enforcement gate.

Current static evidence establishes that the enumerated resources resolve and
that the known conflict classes above are covered. It does not establish that a
stochastic model will always select or obey them; that remains a separate live
E2E question. No current repeated held-out run establishes stable compliance.

## Fourth full-scan findings and verified repairs (2026-07-20)

The fourth scan deliberately removed the earlier test blind spots. It recursively
read all 313 Skill entrypoints and all 447 packaged Markdown files under every
package-declared Skill tree instead of checking selected entrypoints only. The
full-tree tests distinguish real packaged navigation from illustrative project
links: the six
remaining relative Markdown links point to intentionally nonexistent example
files, while every link to an existing same-Skill resource is an exact URI.

Every row below has a current source repair and focused regression evidence:

| Skill or group | Fourth-scan conflict | Verified current resolution | Focused evidence |
|---|---|---|---|
| All 313 entrypoints | The earlier portable-frontmatter test sampled a list and missed `parallel-execution-optimizer`'s Claude-only `tools:` field. | The field is removed, and the inventory test now rejects `tools`, `allowed-tools`, permission, hook, or command metadata across every entrypoint. | `scripts/skill-workflow-inventory.test.js` |
| All packaged Skill Markdown | An unrestricted physical-tree walk counted an ignored `.pytest_cache/README.md` as a 448th resource. | Both inventory seams use package-declared Skill roots, exclude cache artifacts, and fix the authoritative Markdown baseline at 447; a temporary fixture proves cache presence cannot change it. | `skill-resource-navigation-contract.test.js`, `scripts/skill-workflow-inventory.test.js` |
| `prototype`, `improve-codebase-architecture`, Remotion rules, and VideoDB references | Entry Skill files were exact-URI clean, but 38 links in nested resources still navigated with relative `.md` paths. | All real same-Skill resource navigation is exact `skill://`; every concrete URI is resolved against its packaged Skill root. | `skill-resource-navigation-contract.test.js` |
| `agent-architecture-audit`, `backend-patterns`, `coding-standards`, `investor-materials`, `ito-data-atlas-agent`, `mle-workflow`, `product-lens`, `video-editing`, `windows-desktop-e2e`, `fastapi-patterns`, and `strategic-compact` | Loaded guides still contained pair, handoff, route, or trigger-table wording that could create a second composition decision after READY. | Cross-Skill methods are exact non-routing initial-PLAN candidates; loaded guides cannot reselect, auto-load, hand off, replace parent TODO, or choose Main's Agent. A concrete source-revealed URI remains the only bounded extension path before COMMIT. | `ecc-cross-skill-composition-boundaries.test.js` |
| `svg-flowchart`, `motion-foundations`, `knowledge-ops`, and `autonomous-agent-harness` | Broad activation wording, self-load instructions, and Claude session-start claims could override task-local selection or current-host truth. | Selection is task-local; motion resources participate only through PLAN or a bounded extension; Claude memory and autonomous-host examples are explicitly external and grant no current OMP capability or effect. | `skill-activation-boundaries.test.js` |
| `angular-developer`, `token-budget-advisor`, and `vite-patterns` | Hard-trigger descriptions and a response-intercept method could compete with the staged workflow. | Descriptions use positive task-local conditions. Token advice asks only when the user explicitly requests a choice, never precedes or replaces staged work, and applies an already specified depth without another question. | `ecc-residual-workflow-authority.test.js` |
| `frontend-slides` | A bare `STYLE_PRESETS.md` path bypassed the exact resolver, temporary cleanup was implicit, and related Skills were unlabeled. | The preset is exposed through one exact same-Skill URI; preview writes, browser/network/install effects, and cleanup retain exact authorization; related methods are initial-PLAN candidates only. | `ecc-residual-workflow-authority.test.js` |
| `angular-developer`, `frontend-design-direction`, `ui-to-vue`, `windows-desktop-e2e`, `frontend-slides`, `video-editing`, and `uncloud` | Download, install, external API, render, write, deploy, context-switch, and deletion examples did not consistently separate their effect authority. | Each exact target/effect requires explicit user authorization plus current native permission; reference commands and missing-tool fallbacks are not execution or installation authority. | `ecc-residual-workflow-authority.test.js` |

The workflow-card handoff was checked at the same boundary. Every generated card
now uses the same loaded-card soft compiler as the compact index: complete input,
a safe checkpoint, and a visible matching Agent produce one exact `Delegate`
row; otherwise the checkpoint records one matching permitted fallback. Parent
`VERIFY` rows remain separate, and the READY response initializes TODO, ends,
and waits before any project tool starts. This is prompt guidance only and does
not create a dispatch or completion gate.

## Fifth discovery-organization pass (2026-07-20)

The fifth pass reduced discovery depth without adding a router. The compact
workflow index now distinguishes two exact, directly loadable resource classes:

- `D` is a top-level `skill://<id>` exact URI;
- `C` is an index-enumerated
  `skill://ecc-skill-catalog/<id>/SKILL.md` exact URI.

Both classes are optional candidates, never load sets. Main selects only URIs
matching the requested method, evidence rule, verdict, or format. A selected
`C` URI goes directly into PLAN/NOW and does not first load the full ECC catalog.
The top-level `skill://ecc-skill-catalog` adapter remains available only for
unlisted niche discovery, after which the usual exact source-revealed extension
rules apply. An inventory invariant checks that `catalogSkills` is a
subset of workflow candidates, that every `C` target is packaged and resolvable,
and that the D/C split matches top-level OMP discovery. The writing index is also
partitioned into `language`, `format overlays`, and `specialized outputs`;
language is Primary for prose work and the requested format is normally an
Add-on, while format-only conversion, template, or structure work keeps the
format workflow Primary. A preservation-only `writing.latex` Add-on selects
zero format Skills; explicit conversion or template work selects one matching
candidate.

Only the exact native `skill-prompt` body named `omp-enhancer-workflows` counts
as a supplied index. PLAN and READY begin at byte 0 with `W`. Delegated children
consume the frozen assignment Skills and do not rediscover, reselect, or load a
second Skill set. These are visible navigation and assignment contracts, not a
hidden router, gate, dispatch rule, or completion controller.

The same pass front-loaded both handoffs. The compact index places
`DECLARE HANDOFF (soft)` before all domain rows, so its result first points to the next byte-0
PLAN response. Every generated workflow reference places one `READY NEXT (soft)`
sentinel before and one after the detailed card. Both point to the same next
response: byte-0 READY, no other visible text, native TODO init only, end/wait,
with no plugin enforcement. Exact-model Core
bootstrap remains compact and state-aware: for a top-level exact DeepSeek Flash
or MiMo v2.5 task, it distinguishes DIRECT, exact-native supplied index, and
not-supplied index-only read from observed native state without choosing a
workflow or resource.

At COMMIT, every delegated native TODO `items[]` string is one complete exact
`Delegate Agent=... workflow=... step=... skills=... checkpoint=...` row. At
dispatch, native `tasks[].task` itself begins at byte 0 with the mechanically
copied `[workflow=... step=... todo=... skills=...]` prefix; every native `task`
call has nonempty top-level `context`. Batch `context`, name, label, or child
self-reported metadata cannot substitute for the item body. The focused
generator, Core, prompt-parity, and synthetic event tests cover these boundaries.

## Sixth writing-composition actor pass (2026-07-20)

The sixth pass re-read all 28 Writing Helper Skill entrypoints, then followed
the workflow composition graph into selected format, slides, document, design,
research, fact-checking, marketing, SEO, release, and security methods. It found
that one frozen assignment Skill set can contain methods owned by sibling
checkpoints. Capability restrictions already prevented a writer from running a
command or writing a file, but conflicting method prose could still make a
small model attempt the wrong checkpoint.

The scalable repair lives in all four writing Agent prompts. A shared frozen
Skill body owned by a sibling checkpoint is context, not assignment; each child
applies only the review or prose method named by its byte-0 `step` and `todo`.
Writers never execute another checkpoint's command, network call, delegation,
review, publication, or file effect. Checkers apply the same rule without
removing their host- and user-authorized `web_search` for the parent-selected
review mode.

Local actor guards provide depth only where the scan found a concrete conflict:

- writer-facing drafting and polish Skills return proposals, while checker
  Skills return reports in-band and Main owns persistence;
- effectful conversion, precheck, slides, SVG, DOCX, visual-design, benchmark,
  open-source, branch-finishing, SEO, and security-scan methods keep commands
  and file effects with Main or a separately capable Main-selected Agent;
- research, market-research, marketing-campaign, and fact-checking methods tell
  a writer to consume evidence already delivered by Main rather than search,
  invoke domain tools, or issue independent findings or verdicts.

The writing references additionally freeze three exact initial TODO rows:
step-2 writer, step-3 checker, and conditional step-4 corrected-proposal. Main
dispatches step 4 only after accepting at least one checker finding; otherwise
it closes that checkpoint. Complete proposals and reports live in terminal child
delivery using the current host handoff when exposed, or ordinary final response
otherwise, so the boundary stays host-neutral.

The focused seams are `plugins/writing-helper/test/plugin-content.test.js`,
`plugins/omp-config/test/skill-resource-composition-contract.test.js`, and
`plugins/omp-fact-checker/test/fact-checker.test.js`. This two-layer design
avoids mechanically adding the same paragraph to all 313 Skill entrypoints and
does not change routing, delegation, permission, or completion authority.

## Child-local label candidates

The sixth pass promoted the earlier top-level Config candidates
`beamer-to-powerpoint`, `canvas-design`, `docx`, and `frontend-design` into
tested writer actor guards because real writing compositions exposed the
ambiguity. The remaining compatible candidates are the ECC methods
`code-documentation` and `investor-materials`; add a local boundary only if a
later failing composition test demonstrates ambiguity.

The boundary is: this is a bounded local method for an assigned child after
Main selects and loads the workflow; it does not select or dispatch Agents,
replace independent review, own the parent TODO, or authorize external effects.

## Conditional target systems and intentional domain constraints

- `agentic-os`, `plankton-code-quality`, `autonomous-agent-harness`,
  `strategic-compact`, and the autonomous-loop guides may describe routers,
  hooks, compaction commands, or recurring workers only for an explicitly
  requested target system with separate effect limits.
- Preserve fail-closed target behavior in `network-config-validation` and
  payment confirmation/budget limits in `agent-payment-x402`.
- Preserve bounded evidence behavior in `terminal-ops`, `verification-loop`,
  and `canary-watch`.
- Preserve soft fallback in `agent-sort` and publication authorization in
  `opensource-pipeline`.
- Preserve testing-framework fail-fast, coverage thresholds, deployment CI
  gates, database transactions, and security-policy deny rules. These govern
  the target artifact, not the OMP session lifecycle.
- Fact Checker verdict tuple and evidence thresholds remain intact; findings
  are advisory and do not become completion permission.

## Full manifest

The exception sections above take precedence. Every name below that is not named
there has disposition `ALIGNED`.

### Writing Helper, 28

`format-human-comment-helper`, `format-humanizer`, `format-latex2markdown`, `format-markdown2latex`, `format-submission-precheck`, `format-template-latex`, `pku-chinese-phd-thesis-checker`, `plain-chinese-writing`, `research-bogus-data`, `research-experiment`, `research-literature`, `research-phase-navigation`, `research-relatedwork-summarizer`, `research-socratic`, `research-storyline`, `writing-checkers`, `writing-mad-writer`, `writing-markdown-helper`, `writing-review`, `writing-state-machine`, `zh-format-humanizer`, `zh-writing-checkers`, `zh-writing-logic-check`, `zh-writing-mad-writer`, `zh-writing-markdown-helper`, `zh-writing-polish`, `zh-writing-review`, `zh-writing-state-machine`.

### Top-level Config and Fact Checker, 29

`astrbot-plugin-development`, `beamer-to-powerpoint`, `canvas-design`, `caveman`, `code-development`, `conventional-commits`, `deepseek-tool-calling`, `docker-compose`, `docx`, `finishing-a-development-branch`, `frontend-design`, `go-testing`, `grill-with-docs`, `handoff`, `improve-codebase-architecture`, `latex-beamer-slides`, `omp-enhancer-workflows`, `omp-marketplace-plugin-activation`, `prototype`, `slides-storyline`, `spike`, `svg-flowchart`, `using-git-worktrees`, `writing-skills`, `zoom-out`, `citation-authenticity`, `claim-extraction`, `fact-checking`, `source-evaluation`.

### ECC adapter and nested guides, 256

`ecc-skill-catalog`, `accessibility`, `agent-architecture-audit`, `agent-eval`, `agent-harness-construction`, `agent-introspection-debugging`, `agent-payment-x402`, `agent-sort`, `agentic-engineering`, `agentic-os`, `ai-first-engineering`, `ai-regression-testing`, `android-clean-architecture`, `angular-developer`, `api-connector-builder`, `api-design`, `architecture-decision-records`, `article-writing`, `automation-audit-ops`, `autonomous-agent-harness`, `autonomous-loops`, `backend-patterns`, `benchmark-optimization-loop`, `benchmark`, `blender-motion-state-inspection`, `blueprint`, `brand-voice`, `browser-qa`, `build-toolchain-diagnostics`, `bun-runtime`, `canary-watch`, `carrier-relationship-management`, `cisco-ios-patterns`, `ck`, `claude-devfleet`, `click-path-audit`, `clickhouse-io`, `code-documentation`, `code-tour`, `codebase-onboarding`, `coding-standards`, `compose-multiplatform-patterns`, `configure-ecc`, `connections-optimizer`, `content-engine`, `content-hash-cache-pattern`, `context-budget`, `continuous-agent-loop`, `continuous-learning-v2`, `continuous-learning`, `cost-aware-llm-pipeline`, `cost-tracking`, `council`, `cpp-coding-standards`, `cpp-testing`, `crosspost`, `csharp-testing`, `customer-billing-ops`, `customs-trade-compliance`, `dart-flutter-patterns`, `dashboard-builder`, `data-scraper-agent`, `data-throughput-accelerator`, `database-migrations`, `deep-research`, `defi-amm-security`, `deployment-patterns`, `design-system`, `django-celery`, `django-patterns`, `django-security`, `django-tdd`, `django-verification`, `dmux-workflows`, `docker-patterns`, `documentation-lookup`, `dotnet-patterns`, `e2e-testing`, `ecc-guide`, `ecc-tools-cost-audit`, `email-ops`, `energy-procurement`, `enterprise-agent-ops`, `error-handling`, `eval-harness`, `evm-token-decimals`, `exa-search`, `fal-ai-media`, `fastapi-patterns`, `finance-billing-ops`, `flox-environments`, `flutter-dart-code-review`, `foundation-models-on-device`, `frontend-a11y`, `frontend-design-direction`, `frontend-patterns`, `frontend-slides`, `fsharp-patterns`, `fsharp-testing`, `gan-style-harness`, `gateguard`, `git-workflow`, `github-ops`, `golang-patterns`, `golang-testing`, `google-workspace-ops`, `harmonyos-patterns`, `healthcare-cdss-patterns`, `healthcare-emr-patterns`, `healthcare-eval-harness`, `healthcare-phi-compliance`, `hermes-imports`, `hexagonal-architecture`, `hipaa-compliance`, `homelab-network-readiness`, `homelab-network-setup`, `homelab-pihole-dns`, `homelab-vlan-segmentation`, `homelab-wireguard-vpn`, `hookify-rules`, `inventory-demand-planning`, `investor-materials`, `investor-outreach`, `ios-icon-gen`, `iterative-retrieval`, `ito-basket-compare`, `ito-data-atlas-agent`, `ito-market-intelligence`, `ito-trade-planner`, `java-coding-standards`, `jira-integration`, `jpa-patterns`, `knowledge-ops`, `kotlin-coroutines-flows`, `kotlin-exposed-patterns`, `kotlin-ktor-patterns`, `kotlin-patterns`, `kotlin-testing`, `laravel-patterns`, `laravel-plugin-discovery`, `laravel-security`, `laravel-tdd`, `laravel-verification`, `latency-critical-systems`, `lead-intelligence`, `liquid-glass-design`, `llm-trading-agent-security`, `logistics-exception-management`, `make-interfaces-feel-better`, `manim-video`, `market-research`, `marketing-campaign`, `mcp-server-patterns`, `messages-ops`, `mle-workflow`, `motion-advanced`, `motion-foundations`, `motion-patterns`, `motion-ui`, `mysql-patterns`, `nanoclaw-repl`, `nestjs-patterns`, `netmiko-ssh-automation`, `network-bgp-diagnostics`, `network-config-validation`, `network-interface-health`, `nextjs-turbopack`, `nodejs-keccak256`, `nutrient-document-processing`, `nuxt4-patterns`, `openclaw-persona-forge`, `opensource-pipeline`, `parallel-execution-optimizer`, `perl-patterns`, `perl-security`, `perl-testing`, `plankton-code-quality`, `postgres-patterns`, `prediction-market-oracle-research`, `prediction-market-risk-review`, `prisma-patterns`, `product-capability`, `product-lens`, `production-audit`, `production-scheduling`, `project-flow-ops`, `prompt-optimizer`, `python-patterns`, `python-testing`, `pytorch-patterns`, `quality-nonconformance`, `quarkus-patterns`, `quarkus-security`, `quarkus-tdd`, `quarkus-verification`, `ralphinho-rfc-pipeline`, `react-patterns`, `react-performance`, `react-testing`, `recsys-pipeline-architect`, `recursive-decision-ledger`, `redis-patterns`, `regex-vs-llm-structured-text`, `remotion-video-creation`, `repo-scan`, `research-ops`, `returns-reverse-logistics`, `rules-distill`, `rust-patterns`, `rust-testing`, `safety-guard`, `santa-method`, `pubmed-database`, `uspto-database`, `gget`, `literature-review`, `scholar-evaluation`, `search-first`, `security-bounty-hunter`, `security-review`, `security-scan`, `seo`, `skill-comply`, `skill-scout`, `skill-stocktake`, `social-graph-ranker`, `social-publisher`, `springboot-patterns`, `springboot-security`, `springboot-tdd`, `springboot-verification`, `strategic-compact`, `swift-actor-persistence`, `swift-concurrency-6-2`, `swift-patterns`, `swift-protocol-di-testing`, `swiftui-patterns`, `tdd-workflow`, `team-builder`, `terminal-ops`, `tinystruct-patterns`, `token-budget-advisor`, `type-design-review`, `typescript-patterns`, `ui-demo`, `ui-to-vue`, `uncloud`, `unified-notifications-ops`, `verification-loop`, `video-editing`, `videodb`, `visa-doc-translate`, `vite-patterns`, `windows-desktop-e2e`, `workspace-surface-audit`, `x-api`.

## Validation and live evidence

The 2026-07-19 post-repair checkpoint aggregate was:

```text
fdedea294312c44a745feeb4b2e5247cb6b1eba4876b0746707d6e038b92cbd6
```

This digest predates the second-scan repairs and is retained for provenance; it
is not the checksum of the current dirty integration tree. Path-specific tests
first failed against the old contracts, then passed after the bounded repairs.
The 2026-07-19 checkpoint recorded:

- all 313 Skill entrypoints have unique names; the corrected packaged inventory
  contains 447 Skill Markdown resources with resolvable navigation. The older
  raw-tree count of 448 included the ignored `.pytest_cache/README.md`. All 291
  distinct exact literal `skill://...` URIs resolve, and all 255 ECC catalog
  URIs resolve;
- all 70 workflow Skill occurrences and 47 unique candidates resolve;
- `npm run generate:workflows` followed by `npm run check:workflows`: pass, with
  31 current generated artifacts;
- `npm run check:ecc-skills`: pass;
- the DeepSeek/MiMo workflow-capability contract reuses the canonical direct
  fallback reasons, rejects an unqualified fallback summary, and keeps the
  broad code-task compatibility context below 2,600 characters;
- root `npm test`: 156 root tests plus 115 Config, 112 Writing, 169 Testing,
  41 Fact Checker, and 183 Core tests, all passing;
- Writing coverage: 100% lines, branches, and functions;
- Testing Enhancer typecheck, build, and 169 tests: pass;
- `npm run check:marketplace`, `npm run pack:all`, and `git diff --check`: pass.

Current second-scan evidence collected on 2026-07-20 is narrower and explicit:

- `find plugins -name SKILL.md -type f | wc -l`: `313`;
- `node --test plugins/omp-config/test/ecc-high-risk-skill-contract.test.js plugins/omp-config/test/ecc-late-loaded-method-boundaries.test.js plugins/omp-config/test/ecc-regulated-overlay-contract.test.js plugins/omp-config/test/ecc-external-system-boundaries.test.js`: 4/4 pass;
- those tests read the current Skill sources, verify the committed-PLAN and
  native-authority wording, reject the former bare routing forms, and resolve
  every exact same-namespace URI exposed by the ten late-loaded method Skills.

The latest recorded writing pilots are not stability evidence:

- `v19-commit-compiler-writing-pilot-20260720-002` reported
  `behavior=fail`, `infrastructure=clean`;
- `v19-commit-compiler-writing-pilot-20260720-003` reported
  `behavior=fail`, `infrastructure=clean`.

The deterministic D/C and prompt contracts must be regenerated and validated,
then a frozen pilot and repeated held-out matrix must pass before any stable-live
claim is made.

Broad root/package totals, generated catalog freshness, packaging, and
marketplace checks must be re-established after the concurrent integration
tree settles. Historical pass counts above are not current acceptance evidence.

Five hypothesis-changing English LaTeX writing canaries used the same fixed
fixture and clean worktree-installed infrastructure under preceding prompt
revisions. Their frozen traces are:

- `plan-ready-copy-canary-20260719-001`: selected and loaded the correct
  resources but replaced the committed writer/checker chain with a generic
  direct TODO, so no child ran;
- `plan-ready-copy-canary-20260719-002`: ran writer then checker, but the later
  checker assignment drifted from its TODO metadata and the first attempt
  omitted required native `context`;
- `plan-ready-copy-canary-20260719-003`: ignored the reminder stochastically,
  read the target first, and emitted no workflow/Skill/TODO/fork trace;
- `plan-ready-copy-canary-20260719-004`: loaded the correct workflow and Skill,
  emitted PLAN and READY/TODO, and completed exactly one writer followed by one
  checker with stable metadata and nonempty context. It still failed the strict
  visible protocol because narration preceded both declarations;
- `plan-ready-copy-canary-20260719-005`: selected and loaded
  `writing.en + writing.latex` plus `writing-review`, initialized TODO, and ran
  writer then checker exactly once. It kept PLAN/READY in hidden reasoning
  instead of visible output, and the checker metadata omitted the composed
  `writing.latex` workflow ID.

The strict E2E evaluator now checks first-visible-content PLAN/READY markers,
nonempty top-level context on every native task call, dependency order, and exact
assignment metadata.
All five frozen samples remain behavior failures under that evaluator, even
though 004 demonstrates near-complete execution. The two later writing pilots
reported above also remain behavior failures. Current deterministic discovery,
DIRECT, rebase, and fallback corrections have not yet yielded a compliant
repeated held-out sample, so stable DeepSeek Flash compliance remains unproven.
Adding more prompt clauses or rerunning unchanged input would not prove a new
hypothesis.

The exact canary event files live under gitignored `.omp/e2e-results/` and are
therefore independently reviewable only in this working machine, not from a
clean clone. The committed fixture, evaluator, and synthetic tests reproduce the
method and strict contract, but they do not reproduce those stochastic model
outputs.

The current source scan also finds no production `block: true`,
`continue: true`, `triggerTurn()`, `systemPrompt =`, retired public gate alias,
or registered `/test` command. The observed failures therefore remain soft
Agent-behavior limitations; they are not converted into a runtime router,
dispatch hook, completion gate, or automatic retry loop.

`omp_test_analyze` and `omp_test_review` now consume explicit candidate evidence
and do not launch Git or test commands. Missing explicit analyze input is an
advisory evidence gap. Testing commands remain host-observed evidence only.

`omp_core_route_task` still occurs only inside two byte-exact legacy Advisor
migration fingerprints and their synchronization fixture. Those private
constants are never emitted as current guidance; they are retained so Config
sync can recognize and remove an old block. Current packaged Main/Advisor
assets contain neither that identifier nor the accompanying retired routed-
Skill wording, and the context-sync/parity regression tests pass.
