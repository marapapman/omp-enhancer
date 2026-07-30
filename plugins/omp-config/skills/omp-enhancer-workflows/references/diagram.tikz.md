READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.
# `diagram.tikz` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.
Derive TODO internally. Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.

## `diagram.tikz`

- Primary when: Editable TikZ diagram for academic figures, flowcharts, architecture, decision flows, and deploy pipelines; SVG and other formats are only icon assets, preview evidence, or compatibility supplements.
- Reference steps:
  1. [step-1] Main fixes audience, output path, target format, node/edge/groups, labels, icon requirements, asset source boundaries, and acceptance evidence.
  2. [step-2] Produce a complete graphical blueprint: semantic graph, per-node icon plan, manifest draft, alternatives; no final coordinates.
  3. [step-3] Prepare and validate icon assets (OpenTikZ/imagegen/SVG assets), generate previews and manifest.
  4. [step-4] Review asset previews per icon, reject or approve; only new previews are reviewed.
  5. [step-5] Author the semantic graph as an ELK graph IR under approved manifest constraints with layout options and node sizing; no tool invocation or coordinate hand-editing.
  6. [step-5b] Call tikz_generate_diagram with the approved ELK graph IR, write the returned TikZ source to the project-local path, and verify the semantic-graph round-trip.
  7. [step-6] Call tikz_render to produce revision-bound PDF/SVG/PNG evidence.
  8. [step-7] Independently review fresh whole-figure renders for semantic completeness, icon clarity, layering, overlap, clipping, labels, branch semantics, and manifest disclosure.
  9. [step-8] At most one bounded revision for supported findings; rerun asset/ layout/ render; unchanged artifacts are not re-reviewed; defects remain visible.
  10. [step-9] Deliver source files, semantic graph, manifest, preview/render evidence, unresolved limitations, and asset provenance.
- Agent candidates: `designer`, `task`, `visioner`.
- Delegated checkpoints:
  - step-2: designer owns the semantic blueprint and per-icon plan while preserving scope
  - step-3: task prepares and validates icon assets and writes the asset manifest
  - step-4: visioner independently and read-only reviews fresh asset previews and flags unsupported icons
  - step-5: designer authors the ELK graph IR under approved manifest constraints with layout options and node sizing
  - step-5b: task calls tikz_generate_diagram with the designer ELK graph IR, writes the project-local TikZ source, and verifies the semantic-graph round-trip
  - step-6: task invokes the fixed tikz_render renderer for the approved current revision
  - step-7: visioner independently and read-only reviews the fresh current-revision renders
  - step-8: designer applies supported findings, task rerenders, and visioner reviews only fresh rerenders
- Quality checks:
  - semantic completeness and stable IDs, ELK graph IR as the sole source of geometry with edit-contract and icon preservation, asset provenance and portability, safe standalone compile, revision-bound PDF and SVG, current-revision full-size and 60% raster evidence, independent visual review, icon legibility, explicit raster disclosure, and requested paper or slide fit
- Scope notes:
  - Visual-stage chain: designer owns the design or source revision; task owns rendering, compilation, and optional imagegen execution; visioner independently and read-only reviews the current render or layout. Main authorizes external-effect decisions during initial setup and accepts the final delivery. Non-visual stages keep their existing owners and are not assigned to designer or visioner merely because the workflow is visual.
  - When designer is unavailable, record the precise unfulfilled design checkpoint with the permitted `fallback=Agent availability`; Main must not silently self-substitute or claim designer evidence. When visioner is unavailable, record the missing independent current-revision visual evidence; source inspection, compile success, designer self-review, or Main self-review is not visioner evidence. These are visible limitations, never a plugin gate, router, fixed dispatch, completion condition, or automatic loop.
  - SVG and other formats are only icon assets, preview evidence, or compatibility supplements; geometry always comes from ELK IR.
  - OpenTikZ is a read-only source for safe vector icon copy.
  - imagegen (PNG) may be used only when explicitly authorized for node icon assets.
  - Rendering is a deterministic fixed-command pipeline with shell escape disabled.
  - No gate, router, fork, or loop decides completion; each revision cycle is bounded and advisory.
  - visioner review is independent and read-only; it does not render, edit, or decide completion.
- Risk notes:
  - Generated raster icons reduce all-vector scalability and remain separate project assets whose provenance and raster status must stay visible.
  - Brand marks and other third-party assets may carry trademark or usage restrictions even when source graphics are reusable.

EXECUTION DEFAULT (soft): `subagent-driven` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed `task` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase a row; direct fallback is limited to one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. An audit checkpoint named by this card is delegated by default and falls back only when the named audit Agent is unavailable; the recorded fallback names that unavailability. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition. ORCHESTRATOR: Main is the orchestrator. Evidence gathering, planning, implementation, and audit checkpoints are delegated to the Agents named by the loaded card; Main keeps selection, TODO, assignment copy, delivery integration, permission and external-effect decisions, and the final response. Direct work exists only on DIRECT, on `agentic.simple`, or behind a concrete recorded fallback. Main never self-induces a fallback by skipping brief, input, or checkpoint preparation; a fallback= row names exactly one enumerated reason and the affected checkpoint.

TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise `fallback=<one matched permitted limitation>`. Parent VERIFY rows remain separate. Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.
TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.
- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.
- Assignment body byte 0 = `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. Never begin `# Target` or `# Goal`.
- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.
- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with `hub`. Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row; otherwise use one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action.
ORCHESTRATOR: Main is the orchestrator. Evidence gathering, planning, implementation, and audit checkpoints are delegated to the Agents named by the loaded card; Main keeps selection, TODO, assignment copy, delivery integration, permission and external-effect decisions, and the final response. Direct work exists only on DIRECT, on `agentic.simple`, or behind a concrete recorded fallback. Main never self-induces a fallback by skipping brief, input, or checkpoint preparation; a fallback= row names exactly one enumerated reason and the affected checkpoint.

READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.