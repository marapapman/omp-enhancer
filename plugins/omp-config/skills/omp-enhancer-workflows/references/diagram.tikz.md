READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `diagram.tikz` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `diagram.tikz`

- Primary when: TikZ paper diagrams need editable source plus PDF/SVG/PNG evidence.
- Reference steps:
  1. [step-1] Main confirms the user-project output path, intended paper or slide context, fixed pdfLaTeX compatibility, and target width, then requires a semantic figure spec with stable node and edge IDs, labels, branch semantics, groups, primary flow direction, accessibility text, and an asset manifest.
  2. [step-2] Have designer search the pinned OpenTikZ catalog, select the smallest matching icon, template, or example, copy it into the user project without modifying the library, read the chosen template's edit_contract, and prepare the semantic figure spec plus asset manifest while preserving parameters, invariants, palette roles, and semantic node naming.
  3. [step-3] Main alone may use optional OMP imagegen for a missing node icon only when imagegen is visible, useful, authorized, and consistent with the request; never write into the OpenTikZ library. Main passes a returned local image through tikz_prepare_asset to create a normalized SHA-256-named project asset and records prompt, provider, model, hash, relative path, and raster disclosure in the asset manifest; otherwise retain a TikZ or OpenTikZ fallback.
  4. [step-4] Have designer create or revise the project-owned standalone TikZ source from the copied base and semantic figure spec, integrate only manifest-listed assets, keep generated icons separate from labels with explicit padding, preserve the edit_contract, and return the source, spec, manifest, and exact dependency set.
  5. [step-5] Main invokes tikz_render with its fixed pdfLaTeX argument-vector renderer: validate project-relative paths, copy the dependency graph to a temporary workspace, use shell false and no shell escape with no network or user-supplied command, then publish revision-bound PDF, SVG, full-size PNG, and 60% PNG plus structured command evidence for the same current revision.
  6. [step-6] Have visioner independently compare the same current revision's latest full-size and 60% raster renders with the semantic figure spec and asset manifest, checking semantic completeness, direction and branch labels, overlap, clipping, crossings, hierarchy, icon legibility, and every raster disclosure.
  7. [step-7] Main performs finding disposition. For each material finding accepted by Main, give designer one bounded new revision, rerun the fixed renderer, and request at most one fresh affected visioner review of the changed current revision; never review an unchanged artifact or continue automatically.
  8. [step-8] Report the final project-owned TikZ source, semantic figure spec, asset manifest, revision-bound compile and render evidence, independent review verdict, raster disclosures, and unresolved limitations; no verdict decides completion or publication.
- Agent candidates: `designer`, `visioner`.
- Delegated checkpoints:
  - step-2: designer owns bounded OpenTikZ discovery, copy selection, semantic figure spec, asset manifest, and missing-icon identification without modifying the library
  - step-4: designer owns the project TikZ source and manifest-listed asset integration while preserving the selected edit contract
  - step-6: visioner independently reviews the fresh full-size and 60% raster evidence for the current revision against the supplied spec and manifest
  - step-7: designer applies only Main-accepted findings, while visioner performs at most one fresh affected review after rerendering
- Quality checks:
  - semantic completeness and stable IDs, OpenTikZ edit-contract and dependency preservation, asset provenance and portability, safe standalone compile, revision-bound PDF and SVG, current-revision full-size and 60% raster evidence, independent visual review, icon legibility, explicit raster disclosure, Main finding disposition, and requested paper or slide fit
- Scope notes:
  - The pinned OpenTikZ library is read-only; copy selected content into the declared user-project target before editing it.
  - Main retains exclusive ownership of optional OMP imagegen calls, host permission and external-effect decisions, prepared-asset acceptance, integration, and final verification; designer and visioner do not gain that authority.
  - Imagegen is optional and its visibility or activation is not permission, a workflow requirement, or a reason to invent an asset; a native TikZ or OpenTikZ fallback remains valid.
  - The fixed renderer never runs a user-supplied or project-configured command and never treats compile success as visual approval.
  - Direct standalone SVG authoring remains diagram.svg; an SVG preview rendered from editable TikZ remains evidence for diagram.tikz.
  - This card creates no gate, router, permission, completion controller, retry, or automatic correction loop; Main owns disposition and may leave supported limitations visible.
- Risk notes:
  - Generated raster icons reduce all-vector scalability and remain separate project assets whose provenance and raster status must stay visible.
  - Brand marks and other third-party assets may carry trademark or usage restrictions even when source graphics are reusable.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.