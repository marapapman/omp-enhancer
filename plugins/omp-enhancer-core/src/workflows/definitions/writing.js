const VISUAL_AGENT_SCOPE_NOTES = [
  "Visual-stage chain: designer owns the design or source revision; task owns rendering, compilation, and optional imagegen execution; visioner independently and read-only reviews the current render or layout. Main authorizes external-effect decisions during initial setup and accepts the final delivery. Non-visual stages keep their existing owners and are not assigned to designer or visioner merely because the workflow is visual.",
  "When designer is unavailable, record the precise unfulfilled design checkpoint with the permitted `fallback=Agent availability`; Main must not silently self-substitute or claim designer evidence. When visioner is unavailable, record the missing independent current-revision visual evidence; source inspection, compile success, designer self-review, or Main self-review is not visioner evidence. These are visible limitations, never a plugin gate, router, fixed dispatch, completion condition, or automatic loop."
];

export const writingWorkflows = [
  {
    "id": "writing.pending",
    "delegationDefault": "defer-until-composed",
    "chooseWhen": "Temporary Primary when a named writing target's body language is unknown; after one narrow language read, replace once with writing.zh or writing.en before substantive work.",
    "composeWith": [
      "writing.latex",
      "slides.modify",
      "writing.markdown",
      "doc.convert.word"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "After the initial READY, Main performs exactly one narrow source read of the user-named target for body language only; no substantive review or revision."
      },
      {
        "id": "step-2",
        "text": "Emit one replacement `WORKFLOW PLAN` at visible byte 0, replacing `writing.pending` with `writing.zh` or `writing.en` while retaining the same format Add-ons."
      },
      {
        "id": "step-3",
        "text": "Load only newly required language Skills and the selected language workflow reference last; do not reread loaded format companions or other loaded resources, then wait and emit replacement `WORKFLOW READY`."
      },
      {
        "id": "step-4",
        "text": "Rebase TODO from the selected language workflow and follow its subagent-driven writer and checker sequence."
      }
    ],
    "scopeNotes": [
      "The instruction language is not evidence of the document language.",
      "Language-specific skills remain undecided until source text is available.",
      "This is the only one-time replacement PLAN transition: it resolves new language evidence and does not create a router, gate, retry, or general permission to repeat PLAN.",
      "No substantive review or revision occurs between the initial READY and replacement READY.",
      "If the narrow read cannot determine the requested language, ask the user; never repeat the transition or guess."
    ],
    "skills": [],
    "qualityChecks": [
      "preserve meaning, anchors, markup, and document structure"
    ],
    "riskNotes": [],
    "roles": [],
    "delegation": [
      "step-1: Main agent owns the one narrow language-only read after initial READY and delegates no prose work before replacement READY",
      "step-4: after replacement READY, use only the selected writing.zh or writing.en workflow's language-matched subagents"
    ]
  },
  {
    "id": "writing.zh",
    "chooseWhen": "The prose being drafted or revised is Chinese, regardless of the instruction language.",
    "composeWith": [
      "writing.latex",
      "slides.generate",
      "slides.modify",
      "diagram.tikz",
      "writing.markdown",
      "doc.convert.word",
      "research.web",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Form the bounded assignment from the user-named target, requested Chinese operation, preservation constraints, and acceptance evidence without Main `read` or `glob` merely to enrich the assignment."
      },
      {
        "id": "step-2",
        "text": "Make zh-writer the first project actor; it reads the exact target, records semantic anchors, and drafts or revises the requested natural Chinese prose within the preservation constraints."
      },
      {
        "id": "step-3",
        "text": "After the writer delivery, have zh-checker independently compare the source and revision for logic, tone, terminology, readability, and semantic drift without editing the source."
      },
      {
        "id": "step-4",
        "text": "Resolve the frozen conditional row in exactly one branch. Branch A: Main alone performs finding disposition and accepts at least one checker finding; dispatch the original frozen step-4 zh-writer row, then use native TODO `done` for that same row only after its complete corrected-proposal terminal delivery. Branch B: Main accepts zero checker findings; do not dispatch, and use native TODO `done` on the same frozen row with `resolved-no-repair`; never rewrite, drop, or abandon it. Main then applies any authorized file change and verifies scope, voice consistency, semantic anchors, and requested format."
      }
    ],
    "scopeNotes": [
      "This workflow concerns prose rather than code implementation.",
      "A user-named target plus the requested operation, preservation constraints, and acceptance evidence normally forms complete assignment input before Main reads it; the language-matched writer owns the target read and prose revision, the checker remains independent and source-read-only, and the parent owns final reconciliation.",
      "The zh-writer is proposal-only and returns a complete proposed revision or bounded patch; Main owns any authorized file change, and assignment size and structure leave the actor sequence unchanged EXCEPT when the long-form pilot predicate is fully met (see the long-form pilot scope note below).",
      "A request directly addressed to Main, an integrated final delivery, and no explicit delegation request leave the zh-writer then zh-checker sequence unchanged when those safe roles are visible.",
      "With visible safe roles and complete input, READY TODO contains dependency-ordered exact rows for step-2 zh-writer, step-3 zh-checker, and conditional step-4 corrected-proposal, followed by parent-owned integration and verification; this initial READY TODO freezes three exact Delegate rows. Step-3 stays pending until complete writer delivery, and step-4 stays pending through Main's finding disposition before exactly one completion branch resolves it.",
      "Keep the later-wave checker checkpoint stable before and after writer delivery: say that source and revision will be supplied in the assignment body; do not invent artifact:// URIs or rewrite the checkpoint when delivery arrives.",
      "Normal writer delivery itself does not rebase that checkpoint; only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase it.",
      "Branch A: Main alone performs finding disposition and accepts at least one checker finding, dispatches the original frozen step-4 row, and uses native TODO `done` for that same row only after a complete corrected-proposal terminal delivery. Branch B: Main accepts zero checker findings, does not dispatch, and uses native TODO `done` on the same frozen row with `resolved-no-repair`; never rewrite, drop, or abandon it. This no-op branch is parent TODO condition resolution, not child delivery, a successful fork, or permission. Every dispatched row mechanically copies its frozen Agent, workflow, step, skills, and checkpoint metadata.",
      "In a writing.zh plus writing.latex composition, both rows keep workflow metadata exactly writing.zh,writing.latex for the step-2 and step-3 pair; the conditional step-4 row copies the same workflow metadata. Each prose-revision item uses visible zh-writer and the dependent semantic-check item uses zh-checker.",
      "Long-form pilot (conditional): a long-form new-draft sharded-parallel branch activates ONLY when ALL of the following hold: the user explicitly requests a NEW long-form draft (not revision of existing text); there are two or more user-named or request-derivable sections; each section is independently specifiable with a complete brief and disjoint proposal scope; and a shared evidence, terminology, and voice brief is freezable before dispatch.",
      "Long-form pilot negative precedence: ANY of the following routes to the ordinary branch instead: revise, edit, polish, review, correct, proofread, or translate intent; whole-document rewrite; single section; incomplete briefs; or cross-section generation dependency. When any negative trigger applies, the ordinary three frozen rows (step-2 zh-writer, step-3 zh-checker, conditional step-4) remain unchanged.",
      "Long-form pilot branch structure: when the pilot predicate is fully met, emit one step-2 zh-writer proposal row per independent section, each with its complete section brief and disjoint proposal scope; submit runnable rows in one native tasks[] batch only when batch and capacity permit, else use sequential fallback without claiming a throughput gain. Main owns the integration checkpoint that assembles per-section proposals into the integrated draft. Then run exactly one step-3 zh-checker against the integrated draft. Then resolve the existing conditional step-4 as in the ordinary branch. Writers remain proposal-only; Main owns integration and all authorized writes. The checker contract is not overridden by any additional review layer or Main-led re-check."
    ],
    "skills": [
      "plain-chinese-writing",
      "zh-writing-review"
    ],
    "qualityChecks": [
      "meaning and semantic-anchor preservation, Chinese logic and style, terminology consistency, independent checker evidence, parent scope reconciliation, and requested format"
    ],
    "riskNotes": [],
    "roles": [
      "zh-writer",
      "zh-checker"
    ],
    "delegation": [
      "step-2: zh-writer is the first project actor and reads the exact target before owning the requested Chinese drafting or prose revision",
      "step-3: zh-checker independently reviews source and revision after the writer delivery without editing the source",
      "step-4: zh-writer returns one corrected proposal for parent-accepted findings"
    ]
  },
  {
    "id": "writing.en",
    "chooseWhen": "The prose being drafted or revised is English, regardless of the instruction language.",
    "composeWith": [
      "writing.latex",
      "slides.generate",
      "slides.modify",
      "diagram.tikz",
      "writing.markdown",
      "doc.convert.word",
      "research.web",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Form the bounded assignment from the user-named target, requested English operation, preservation constraints, and acceptance evidence without Main `read` or `glob` merely to enrich the assignment."
      },
      {
        "id": "step-2",
        "text": "Make writer the first project actor; it reads the exact target, records semantic anchors, and drafts or revises the requested English prose within the preservation constraints."
      },
      {
        "id": "step-3",
        "text": "After the writer delivery, have checker independently compare the source and revision for logic, tone, terminology, formatting, readability, and semantic drift without editing the source."
      },
      {
        "id": "step-4",
        "text": "Resolve the frozen conditional row in exactly one branch. Branch A: Main alone performs finding disposition and accepts at least one checker finding; dispatch the original frozen step-4 writer row, then use native TODO `done` for that same row only after its complete corrected-proposal terminal delivery. Branch B: Main accepts zero checker findings; do not dispatch, and use native TODO `done` on the same frozen row with `resolved-no-repair`; never rewrite, drop, or abandon it. Main then applies any authorized file change and verifies scope, voice consistency, semantic anchors, and requested format."
      }
    ],
    "scopeNotes": [
      "This workflow concerns prose rather than code implementation.",
      "A user-named target plus the requested operation, preservation constraints, and acceptance evidence normally forms complete assignment input before Main reads it; the language-matched writer owns the target read and prose revision, the checker remains independent and source-read-only, and the parent owns final reconciliation.",
      "The writer is proposal-only and returns a complete proposed revision or bounded patch; Main owns any authorized file change, and assignment size and structure leave the actor sequence unchanged EXCEPT when the long-form pilot predicate is fully met (see the long-form pilot scope note below).",
      "A request directly addressed to Main, an integrated final response, and no explicit delegation request leave the writer then checker sequence unchanged when those safe roles are visible.",
      "With visible safe roles and complete input, READY TODO contains dependency-ordered exact rows for step-2 writer, step-3 checker, and conditional step-4 corrected-proposal, followed by parent-owned integration and verification; this initial READY TODO freezes three exact Delegate rows. Step-3 stays pending until complete writer delivery, and step-4 stays pending through Main's finding disposition before exactly one completion branch resolves it.",
      "Keep the later-wave checker checkpoint stable before and after writer delivery: say that source and revision will be supplied in the assignment body; do not invent artifact:// URIs or rewrite the checkpoint when delivery arrives.",
      "Normal writer delivery itself does not rebase that checkpoint; only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase it.",
      "Branch A: Main alone performs finding disposition and accepts at least one checker finding, dispatches the original frozen step-4 row, and uses native TODO `done` for that same row only after a complete corrected-proposal terminal delivery. Branch B: Main accepts zero checker findings, does not dispatch, and uses native TODO `done` on the same frozen row with `resolved-no-repair`; never rewrite, drop, or abandon it. This no-op branch is parent TODO condition resolution, not child delivery, a successful fork, or permission. Every dispatched row mechanically copies its frozen Agent, workflow, step, skills, and checkpoint metadata.",
      "In a writing.en plus writing.latex composition, both rows keep workflow metadata exactly writing.en,writing.latex for the step-2 and step-3 pair; the conditional step-4 row copies the same workflow metadata. Each prose-revision item uses visible writer and the dependent semantic-check item uses checker.",
      "Long-form pilot (conditional): a long-form new-draft sharded-parallel branch activates ONLY when ALL of the following hold: the user explicitly requests a NEW long-form draft (not revision of existing text); there are two or more user-named or request-derivable sections; each section is independently specifiable with a complete brief and disjoint proposal scope; and a shared evidence, terminology, and voice brief is freezable before dispatch.",
      "Long-form pilot negative precedence: ANY of the following routes to the ordinary branch instead: revise, edit, polish, review, correct, proofread, or translate intent; whole-document rewrite; single section; incomplete briefs; or cross-section generation dependency. When any negative trigger applies, the ordinary three frozen rows (step-2 writer, step-3 checker, conditional step-4) remain unchanged.",
      "Long-form pilot branch structure: when the pilot predicate is fully met, emit one step-2 writer proposal row per independent section, each with its complete section brief and disjoint proposal scope; submit runnable rows in one native tasks[] batch only when batch and capacity permit, else use sequential fallback without claiming a throughput gain. Main owns the integration checkpoint that assembles per-section proposals into the integrated draft. Then run exactly one step-3 checker against the integrated draft. Then resolve the existing conditional step-4 as in the ordinary branch. Writers remain proposal-only; Main owns integration and all authorized writes. The checker contract is not overridden by any additional review layer or Main-led re-check."
    ],
    "skills": [
      "writing-review"
    ],
    "qualityChecks": [
      "meaning and semantic-anchor preservation, English logic and style, terminology consistency, independent checker evidence, parent scope reconciliation, and requested venue or format"
    ],
    "riskNotes": [],
    "roles": [
      "writer",
      "checker"
    ],
    "delegation": [
      "step-2: writer is the first project actor and reads the exact target before owning the requested English drafting or prose revision",
      "step-3: checker independently reviews source and revision after the writer delivery without editing the source",
      "step-4: writer returns one corrected proposal for parent-accepted findings"
    ]
  },
  {
    "id": "writing.latex",
    "chooseWhen": "LaTeX source/output, LaTeX prose, or preserved commands: Add-on to matching prose; Primary only for format/structure work. A preservation-only Add-on selects zero format Skills; explicit conversion or template selects one matching candidate.",
    "composeWith": [
      "writing.pending",
      "writing.zh",
      "writing.en",
      "writing.markdown",
      "slides.generate",
      "slides.modify",
      "research.web",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "The owning workflow checkpoint actor reads the relevant source and local macros; when composed with a language workflow, the language writer owns the prose target read."
      },
      {
        "id": "step-2",
        "text": "Preserve commands, comments, citations, math, labels, and revision markers."
      },
      {
        "id": "step-3",
        "text": "Make only the requested format conversion or LaTeX-structure change; a composed language writer owns prose revision."
      },
      {
        "id": "step-4",
        "text": "Use a language-neutral task only for bounded compile evidence; the composed language checker owns semantic review."
      },
      {
        "id": "step-audit",
        "text": "When no composed language checker owns the independent audit, reviewer audits the format output against preservation, structure, and compile or render evidence; a composed writer/checker Primary keeps its sequence unchanged"
      },
    ],
    "scopeNotes": [
      "Compilation and publication are separate workflow steps when requested.",
      "A TikZ figure source alone selects diagram.tikz, not writing.latex; compose this card only for an independently requested LaTeX prose, document-format, template, or structure operation.",
      "When composed with writing.en or writing.zh as a preservation-only Add-on, it contributes LaTeX preservation constraints only: select zero format Skills and create no generic `task` Delegate row.",
      "Its generic `task` candidate is only for an explicitly requested format conversion, LaTeX-structure change, or compile-evidence checkpoint; it is not a candidate for prose revision or semantic check when a language workflow is composed."
    ],
    "skills": [
      "format-markdown2latex",
      "format-latex2markdown",
      "format-template-latex"
    ],
    "qualityChecks": [
      "LaTeX structure, active-text boundaries, reference integrity, and compile evidence when requested"
    ],
    "riskNotes": [],
    "roles": [
      "task",
      "reviewer"
    ],
    "delegation": [
      "step-3: task owns only an explicitly requested format-only conversion or LaTeX-structure change; the writer selected from composed writing.zh or writing.en owns every prose revision checkpoint",
      "step-4: task may return only explicitly requested compile evidence; the selected composed language checker owns every semantic-check checkpoint, while the parent reconciles structure and scope",
      "step-audit: reviewer audits the format output when no composed language checker owns the independent audit; composed writer/checker sequences stay unchanged"
    ]
  },
  {
    "id": "slides.generate",
    "chooseWhen": "New LaTeX Beamer deck requiring template/story decisions before frame authoring.",
    "composeWith": [
      "writing.zh",
      "writing.en",
      "writing.latex",
      "diagram.tikz",
      "design.visual",
      "research.web",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Inspect project instructions, the template, compiler, and any explicitly supplied conversion command."
      },
      {
        "id": "step-2",
        "text": "Validate template readiness through the Beamer entry point, theme, logo decision, layout assets, and a compile smoke."
      },
      {
        "id": "step-3",
        "text": "If the template is not ready, discuss its style, logo, aspect ratio, typography, and layout with the user and configure it first."
      },
      {
        "id": "step-4",
        "text": "Commit a numbered working outline from the supplied purpose, audience, duration, output language, evidence, and safe explicit assumptions; ask only when a missing choice materially changes the deck and cannot be resolved from the request or project context."
      },
      {
        "id": "step-5",
        "text": "Generate Beamer frames from the committed template and working outline, applying the PLAN-selected writing.zh or writing.en method for the agreed output language."
      },
      {
        "id": "step-6",
        "text": "Have task compile and render the draft deck, retaining an initial PDF and page images for the layout pass."
      },
      {
        "id": "step-7",
        "text": "Perform the final layout pass across the deck, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, spacing, and hierarchy without changing the committed story."
      },
      {
        "id": "step-8",
        "text": "Reconcile the layout revision against the committed outline, output language, source facts, semantic anchors, and LaTeX structure; restore unintended content or scope changes before rendering."
      },
      {
        "id": "step-9",
        "text": "Have task recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh renders of every page, and an overview or contact sheet."
      },
      {
        "id": "step-10",
        "text": "Independently inspect the latest rendered pages and overview or contact sheet for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and cross-slide consistency, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision."
      },
      {
        "id": "step-11",
        "text": "For each visual review finding, produce a bounded new layout revision, recompile and create fresh renders, then the fresh rerenders are reviewed at most once; do not review an unchanged artifact and report remaining findings."
      },
      {
        "id": "step-12",
        "text": "Only when the user supplied a conversion command, run it after the final Beamer revision passes independent visual review and verify the PowerPoint artifact."
      }
    ],
    "scopeNotes": [
      ...VISUAL_AGENT_SCOPE_NOTES,
      "Template discussion precedes story discussion when configuration is incomplete.",
      "A familiar template or converter is not a substitute for the user-selected template or command.",
      "The designer-visioner-task loop is self-contained: designer owns layout changes, task renders, visioner reviews renders. Source inspection or compile success does not replace current-revision visual evidence."
    ],
    "skills": [
      "latex-beamer-slides",
      "slides-storyline",
      "beamer-to-powerpoint"
    ],
    "qualityChecks": [
      "template readiness, committed story outline, post-layout semantic and LaTeX preservation, output-language writing compliance, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, compile evidence, and user-command conversion evidence when requested"
    ],
    "riskNotes": [],
    "roles": [
      "designer",
      "task",
      "visioner"
    ],
    "delegation": [
      "step-6: task owns compilation and rendering of every deck revision",
      "step-7: designer owns the final layout pass and every layout revision",
      "step-8: designer reconciles the layout revision against committed scope",
      "step-9: task recompiles and rerenders after every layout revision",
      "step-10: visioner independently reviews the latest rendered pages and deck overview",
      "step-11: designer fixes visioner findings, task rerenders, and visioner reviews only fresh rerenders"
    ]
  },
  {
    "id": "slides.modify",
    "chooseWhen": "Bounded wording, language, or existing-style changes to a current LaTeX Beamer deck.",
    "composeWith": [
      "writing.pending",
      "writing.zh",
      "writing.en",
      "writing.latex",
      "diagram.tikz"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Read the exact target, body language, current template and style, and local build commands."
      },
      {
        "id": "step-2",
        "text": "Apply the PLAN-selected writing.zh or writing.en method from the slide body while preserving LaTeX structure and semantic anchors."
      },
      {
        "id": "step-3",
        "text": "Apply only the requested wording, language-norm, and existing-style changes while preserving story order, template, logo, layout, math, citations, code, and unrelated content."
      },
      {
        "id": "step-4",
        "text": "Compile and render the affected deck, then inspect the semantic diff and identify the changed frames and any pages whose layout they can influence."
      },
      {
        "id": "step-5",
        "text": "Perform a final layout pass on the changed frames and affected pages, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, and spacing while preserving the existing visual style."
      },
      {
        "id": "step-6",
        "text": "Reconcile the layout revision against the requested semantic diff, LaTeX anchors, and authorized scope; restore any unintended wording, math, citation, frame-order, or unrelated change before rendering."
      },
      {
        "id": "step-7",
        "text": "Have task recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh high-resolution affected-page renders, and a current full-deck overview or contact sheet."
      },
      {
        "id": "step-8",
        "text": "Independently review the latest renders for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and consistency with the existing deck, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision."
      },
      {
        "id": "step-9",
        "text": "For each visual review finding, make a bounded fix, recompile and create fresh rerenders, then the fresh rerenders are reviewed at most once; do not review an unchanged artifact and report any unresolved limitation."
      },
    ],
    "scopeNotes": [
      ...VISUAL_AGENT_SCOPE_NOTES,
      "Do not reopen template selection or story planning for an ordinary modification.",
      "A path-only request remains language-pending until the target body is read.",
      "Do not widen scope to unrelated pre-existing layout defects; shared template or macro changes expand visual review to every page they can affect.",
      "Designer owns bounded layout revisions, task renders, visioner reviews renders. Review only evidence from the current revision."
    ],
    "skills": [
      "latex-beamer-slides"
    ],
    "qualityChecks": [
      "requested-scope preservation after every layout revision, source-language writing compliance, semantic and LaTeX anchor preservation, existing visual-style consistency, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, and compile evidence when in scope"
    ],
    "riskNotes": [],
    "roles": [
      "designer",
      "task",
      "visioner"
    ],
    "delegation": [
      "step-4: task owns compilation and rendering of every deck revision",
      "step-5: designer owns the bounded final layout pass and any resulting source revision",
      "step-6: designer reconciles the layout revision against committed scope",
      "step-7: task recompiles and rerenders after every layout revision",
      "step-8: visioner independently reviews the latest affected-page renders",
      "step-9: designer fixes visioner findings, task rerenders, and visioner reviews only fresh rerenders"
    ]
  },
  {
    "id": "diagram.tikz",
    "chooseWhen": "Editable TikZ diagram for academic figures, flowcharts, architecture, decision flows, and deploy pipelines; SVG and other formats are only icon assets, preview evidence, or compatibility supplements.",
    "composeWith": [
      "design.visual",
      "slides.generate",
      "slides.modify",
      "writing.zh",
      "writing.en"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Main fixes audience, output path, target format, node/edge/groups, labels, icon requirements, asset source boundaries, and acceptance evidence."
      },
      {
        "id": "step-2",
        "text": "Produce a complete graphical blueprint: semantic graph, per-node icon plan, manifest draft, alternatives; no final coordinates."
      },
      {
        "id": "step-3",
        "text": "Prepare and validate icon assets (OpenTikZ/imagegen/SVG assets), generate previews and manifest."
      },
      {
        "id": "step-4",
        "text": "Review asset previews per icon, reject or approve; only new previews are reviewed."
      },
      {
        "id": "step-5",
        "text": "Author the semantic graph as an ELK graph IR under approved manifest constraints with layout options and node sizing; no tool invocation or coordinate hand-editing."
      },
      {
        "id": "step-5b",
        "text": "Call tikz_generate_diagram with the approved ELK graph IR, write the returned TikZ source to the project-local path, and verify the semantic-graph round-trip."
      },
      {
        "id": "step-6",
        "text": "Call tikz_render to produce revision-bound PDF/SVG/PNG evidence."
      },
      {
        "id": "step-7",
        "text": "Independently review fresh whole-figure renders for semantic completeness, icon clarity, layering, overlap, clipping, labels, branch semantics, and manifest disclosure."
      },
      {
        "id": "step-8",
        "text": "At most one bounded revision for supported findings; rerun asset/ layout/ render; unchanged artifacts are not re-reviewed; defects remain visible."
      },
      {
        "id": "step-9",
        "text": "Deliver source files, semantic graph, manifest, preview/render evidence, unresolved limitations, and asset provenance."
      }
    ],
    "scopeNotes": [
      ...VISUAL_AGENT_SCOPE_NOTES,
      "SVG and other formats are only icon assets, preview evidence, or compatibility supplements; geometry always comes from ELK IR.",
      "OpenTikZ is a read-only source for safe vector icon copy.",
      "imagegen (PNG) may be used only when explicitly authorized for node icon assets.",
      "Rendering is a deterministic fixed-command pipeline with shell escape disabled.",
      "No gate, router, fork, or loop decides completion; each revision cycle is bounded and advisory.",
      "visioner review is independent and read-only; it does not render, edit, or decide completion."
    ],
    "skills": [
      "tikz-diagram",
      "svg-flowchart"
    ],
    "qualityChecks": [
      "semantic completeness and stable IDs, ELK graph IR as the sole source of geometry with edit-contract and icon preservation, asset provenance and portability, safe standalone compile, revision-bound PDF and SVG, current-revision full-size and 60% raster evidence, independent visual review, icon legibility, explicit raster disclosure, and requested paper or slide fit"
    ],
    "riskNotes": [
      "Generated raster icons reduce all-vector scalability and remain separate project assets whose provenance and raster status must stay visible.",
      "Brand marks and other third-party assets may carry trademark or usage restrictions even when source graphics are reusable."
    ],
    "roles": [
      "designer",
      "task",
      "visioner"
    ],
    "delegation": [
      "step-2: designer owns the semantic blueprint and per-icon plan while preserving scope",
      "step-3: task prepares and validates icon assets and writes the asset manifest",
      "step-4: visioner independently and read-only reviews fresh asset previews and flags unsupported icons",
      "step-5: designer authors the ELK graph IR under approved manifest constraints with layout options and node sizing",
      "step-5b: task calls tikz_generate_diagram with the designer ELK graph IR, writes the project-local TikZ source, and verifies the semantic-graph round-trip",
      "step-6: task invokes the fixed tikz_render renderer for the approved current revision",
      "step-7: visioner independently and read-only reviews the fresh current-revision renders",
      "step-8: designer applies supported findings, task rerenders, and visioner reviews only fresh rerenders"
    ]
  },
  {
    "id": "writing.markdown",
    "chooseWhen": "Markdown source/output: Add-on to matching prose; Primary only for Markdown conversion or structure work.",
    "composeWith": [
      "writing.pending",
      "writing.zh",
      "writing.en",
      "writing.latex",
      "research.web",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Read the source and local conventions."
      },
      {
        "id": "step-2",
        "text": "Make the requested revision or conversion."
      },
      {
        "id": "step-3",
        "text": "Review headings, lists, links, citations, and code fences."
      },
      {
        "id": "step-4",
        "text": "Render or verify when in scope."
      },
      {
        "id": "step-audit",
        "text": "When no composed language checker owns the independent audit, reviewer audits the format output against preservation, structure, and compile or render evidence; a composed writer/checker Primary keeps its sequence unchanged"
      },
    ],
    "scopeNotes": [
      "Code mentioned inside prose does not by itself make this a code implementation task.",
      "For prose work, select only the Markdown helper matching the composed writing.zh or writing.en body language; never load both language helpers."
    ],
    "skills": [
      "writing-markdown-helper",
      "zh-writing-markdown-helper"
    ],
    "qualityChecks": [
      "Markdown structure, link and fence integrity, and consistent prose"
    ],
    "riskNotes": [],
    "roles": [
      "task",
      "reviewer"
    ],
    "delegation": [
      "step-2: task owns only a bounded format-only conversion and Markdown-structure preservation slice; for prose changes, prefer the writer from the composed writing.zh or writing.en workflow",
      "step-3: prefer the composed language checker for prose review; task may return bounded structure evidence, while the parent reconciles Markdown scope",
      "step-audit: reviewer audits the format output when no composed language checker owns the independent audit; composed writer/checker sequences stay unchanged"
    ]
  },
  {
    "id": "doc.convert.word",
    "chooseWhen": "Word source/output: Add-on to matching prose; Primary only for Word conversion or structure work.",
    "composeWith": [
      "writing.pending",
      "writing.zh",
      "writing.en",
      "research.web"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Inspect source and target format."
      },
      {
        "id": "step-2",
        "text": "Confirm output location and preservation needs."
      },
      {
        "id": "step-3",
        "text": "Create or convert."
      },
      {
        "id": "step-4",
        "text": "Review headings, tables, figures, and document structure."
      },
      {
        "id": "step-audit",
        "text": "When no composed language checker owns the independent audit, reviewer audits the format output against preservation, structure, and compile or render evidence; a composed writer/checker Primary keeps its sequence unchanged"
      },
    ],
    "scopeNotes": [
      "Source preservation and overwrite risk deserve explicit attention."
    ],
    "skills": [
      "docx"
    ],
    "qualityChecks": [
      "source fidelity, target readability, output existence, and overwrite awareness"
    ],
    "riskNotes": [
      "Confirm the intended output path before replacing an existing document."
    ],
    "roles": [
      "task",
      "reviewer"
    ],
    "delegation": [
      "step-3: task owns only a bounded format conversion and document-structure preservation slice; for prose changes, prefer the writer from the composed writing.zh or writing.en workflow",
      "step-4: prefer the composed language checker for revised prose; task may return bounded structure evidence, while the parent reconciles document scope and visual review",
      "step-audit: reviewer audits the format output when no composed language checker owns the independent audit; composed writer/checker sequences stay unchanged"
    ]
  }
];
