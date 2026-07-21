const VISUAL_AGENT_SCOPE_NOTES = [
  "Visual-stage chain: designer owns the design or source revision; Main reconciles requested scope and binds or renders one current revision; visioner then independently and read-only reviews that current render or layout. Non-visual stages keep their existing owners and are not assigned to designer or visioner merely because the workflow is visual.",
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
      "diagram.svg",
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
      "The zh-writer is proposal-only and returns a complete proposed revision or bounded patch; Main owns any authorized file change, and assignment size leaves the actor sequence unchanged.",
      "A request directly addressed to Main, an integrated final delivery, and no explicit delegation request leave the zh-writer then zh-checker sequence unchanged when those safe roles are visible.",
      "With visible safe roles and complete input, READY TODO contains dependency-ordered exact rows for step-2 zh-writer, step-3 zh-checker, and conditional step-4 corrected-proposal, followed by parent-owned integration and verification; this initial READY TODO freezes three exact Delegate rows. Step-3 stays pending until complete writer delivery, and step-4 stays pending through Main's finding disposition before exactly one completion branch resolves it.",
      "Keep the later-wave checker checkpoint stable before and after writer delivery: say that source and revision will be supplied in the assignment body; do not invent artifact:// URIs or rewrite the checkpoint when delivery arrives.",
      "Normal writer delivery itself does not rebase that checkpoint; only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase it.",
      "Branch A: Main alone performs finding disposition and accepts at least one checker finding, dispatches the original frozen step-4 row, and uses native TODO `done` for that same row only after a complete corrected-proposal terminal delivery. Branch B: Main accepts zero checker findings, does not dispatch, and uses native TODO `done` on the same frozen row with `resolved-no-repair`; never rewrite, drop, or abandon it. This no-op branch is parent TODO condition resolution, not child delivery, a successful fork, or permission. Every dispatched row mechanically copies its frozen Agent, workflow, step, skills, and checkpoint metadata.",
      "In a writing.zh plus writing.latex composition, both rows keep workflow metadata exactly writing.zh,writing.latex for the step-2 and step-3 pair; the conditional step-4 row copies the same workflow metadata. Each prose-revision item uses visible zh-writer and the dependent semantic-check item uses zh-checker."
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
      "diagram.svg",
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
      "The writer is proposal-only and returns a complete proposed revision or bounded patch; Main owns any authorized file change, and assignment size leaves the actor sequence unchanged.",
      "A request directly addressed to Main, an integrated final response, and no explicit delegation request leave the writer then checker sequence unchanged when those safe roles are visible.",
      "With visible safe roles and complete input, READY TODO contains dependency-ordered exact rows for step-2 writer, step-3 checker, and conditional step-4 corrected-proposal, followed by parent-owned integration and verification; this initial READY TODO freezes three exact Delegate rows. Step-3 stays pending until complete writer delivery, and step-4 stays pending through Main's finding disposition before exactly one completion branch resolves it.",
      "Keep the later-wave checker checkpoint stable before and after writer delivery: say that source and revision will be supplied in the assignment body; do not invent artifact:// URIs or rewrite the checkpoint when delivery arrives.",
      "Normal writer delivery itself does not rebase that checkpoint; only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase it.",
      "Branch A: Main alone performs finding disposition and accepts at least one checker finding, dispatches the original frozen step-4 row, and uses native TODO `done` for that same row only after a complete corrected-proposal terminal delivery. Branch B: Main accepts zero checker findings, does not dispatch, and uses native TODO `done` on the same frozen row with `resolved-no-repair`; never rewrite, drop, or abandon it. This no-op branch is parent TODO condition resolution, not child delivery, a successful fork, or permission. Every dispatched row mechanically copies its frozen Agent, workflow, step, skills, and checkpoint metadata.",
      "In a writing.en plus writing.latex composition, both rows keep workflow metadata exactly writing.en,writing.latex for the step-2 and step-3 pair; the conditional step-4 row copies the same workflow metadata. Each prose-revision item uses visible writer and the dependent semantic-check item uses checker."
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
      }
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
      "task"
    ],
    "delegation": [
      "step-3: task owns only an explicitly requested format-only conversion or LaTeX-structure change; the writer selected from composed writing.zh or writing.en owns every prose revision checkpoint",
      "step-4: task may return only explicitly requested compile evidence; the selected composed language checker owns every semantic-check checkpoint, while the parent reconciles structure and scope"
    ]
  },
  {
    "id": "slides.generate",
    "chooseWhen": "New LaTeX Beamer deck requiring template/story decisions before frame authoring.",
    "composeWith": [
      "writing.zh",
      "writing.en",
      "writing.latex",
      "diagram.svg",
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
        "text": "Compile and render the draft deck, retaining an initial PDF and page images for the layout pass."
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
        "text": "Recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh renders of every page, and an overview or contact sheet."
      },
      {
        "id": "step-10",
        "text": "Independently inspect the latest rendered pages and overview or contact sheet for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and cross-slide consistency, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision."
      },
      {
        "id": "step-11",
        "text": "For each material finding accepted by Main, produce a bounded new layout revision, have the parent reconcile content and scope, then recompile and create fresh renders before at most one fresh affected visual review; do not review an unchanged artifact and report remaining findings."
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
      "When Main delegates, the designer owns slide-layout changes and the visioner remains read-only; source inspection, compile success, or author self-review does not replace current-revision visual evidence."
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
      "visioner"
    ],
    "delegation": [
      "step-7: designer owns the final layout pass and every layout revision",
      "step-10: visioner independently reviews the latest rendered pages and deck overview",
      "step-11: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders"
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
        "text": "Recompile and render the layout revision; bind the revision identifier, PDF, render directory, fresh high-resolution affected-page renders, and a current full-deck overview or contact sheet."
      },
      {
        "id": "step-8",
        "text": "Independently review the latest renders for layout errors, overlap, crowding, clipping, readability, image treatment, margins, and consistency with the existing deck, then record exactly APPROVED | CHANGES_REQUIRED | UNREVIEWABLE for that revision."
      },
      {
        "id": "step-9",
        "text": "For each material finding accepted by Main, make only the necessary bounded fix, have the parent reconcile semantics and scope, then recompile and create fresh rerenders before at most one fresh affected visual review; do not review an unchanged artifact and report any unresolved limitation."
      }
    ],
    "scopeNotes": [
      ...VISUAL_AGENT_SCOPE_NOTES,
      "Do not reopen template selection or story planning for an ordinary modification.",
      "A path-only request remains language-pending until the target body is read.",
      "Do not widen scope to unrelated pre-existing layout defects; shared template or macro changes expand visual review to every page they can affect.",
      "When Main delegates, the designer owns bounded layout revisions and the visioner remains read-only; review only evidence from the current revision."
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
      "visioner"
    ],
    "delegation": [
      "step-5: designer owns the bounded final layout pass and any resulting source revision",
      "step-8: visioner independently reviews the latest affected-page renders",
      "step-9: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders"
    ]
  },
  {
    "id": "diagram.svg",
    "chooseWhen": "Standalone monochrome SVG workflow/process/block/box diagram with rendered visual QA.",
    "composeWith": [
      "design.visual",
      "slides.generate",
      "writing.zh",
      "writing.en"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Establish the output path, display size, node and edge model, labels, branch semantics, dashed-line meaning, and primary flow direction."
      },
      {
        "id": "step-2",
        "text": "Create the standalone SVG in black and white using only simple shapes, straight or dashed lines, and orthogonal polylines, with no curved connectors."
      },
      {
        "id": "step-3",
        "text": "Run the static checker, render the current revision at full size and 60% scale, and retain fresh raster evidence."
      },
      {
        "id": "step-4",
        "text": "Independently inspect the latest rasters for semantic accuracy, overlaps, text fit, connector collisions, crossings, spacing, and readability."
      },
      {
        "id": "step-5",
        "text": "For each material finding accepted by Main, produce a new revision, rerun validation and rendering, then perform at most one fresh affected independent visual review; do not review an unchanged artifact and report remaining geometry failures."
      },
      {
        "id": "step-6",
        "text": "Report final source validation and current-revision rendered evidence together with any remaining layout or review limitations; no verdict decides completion."
      }
    ],
    "scopeNotes": [
      ...VISUAL_AGENT_SCOPE_NOTES,
      "When Main delegates, the designer owns SVG changes and the visioner remains read-only; the main agent coordinates revisions.",
      "Do not substitute source inspection or author self-review for independent rendered evidence.",
      "Review only fresh revisions; do not rerun unchanged reviews."
    ],
    "skills": [
      "svg-flowchart"
    ],
    "qualityChecks": [
      "node and edge completeness, arrow direction, zero unintended overlap or text clipping, zero connector collision or avoidable crossing, readable font size, balanced spacing, strict monochrome geometry, and current-revision rendered evidence"
    ],
    "riskNotes": [],
    "roles": [
      "designer",
      "visioner"
    ],
    "delegation": [
      "step-2: designer creates the SVG and owns every source revision",
      "step-4: visioner independently reviews the fresh full-size and 60% raster renders",
      "step-5: designer applies findings and visioner reviews only the resulting new revision"
    ]
  },
  {
    "id": "diagram.tikz",
    "chooseWhen": "Editable TikZ paper diagram with PDF/SVG/PNG evidence.",
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
        "text": "Main confirms the user-project output path, intended paper or slide context, fixed pdfLaTeX compatibility, and target width, then requires a semantic figure spec with stable node and edge IDs, labels, branch semantics, groups, primary flow direction, accessibility text, and an asset manifest."
      },
      {
        "id": "step-2",
        "text": "Have designer search the pinned OpenTikZ catalog, select the smallest matching icon, template, or example, copy it into the user project without modifying the library, read the chosen template's edit_contract, and prepare the semantic figure spec plus asset manifest while preserving parameters, invariants, palette roles, and semantic node naming."
      },
      {
        "id": "step-3",
        "text": "Main alone may use optional OMP imagegen for a missing node icon only when imagegen is visible, useful, authorized, and consistent with the request; never write into the OpenTikZ library. Main passes a returned local image through tikz_prepare_asset to create a normalized SHA-256-named project asset and records prompt, provider, model, hash, relative path, and raster disclosure in the asset manifest; otherwise retain a TikZ or OpenTikZ fallback."
      },
      {
        "id": "step-4",
        "text": "Have designer create or revise the project-owned standalone TikZ source from the copied base and semantic figure spec, integrate only manifest-listed assets, keep generated icons separate from labels with explicit padding, preserve the edit_contract, and return the source, spec, manifest, and exact dependency set."
      },
      {
        "id": "step-5",
        "text": "Main invokes tikz_render with its fixed pdfLaTeX argument-vector renderer: validate project-relative paths, copy the dependency graph to a temporary workspace, use shell false and no shell escape with no network or user-supplied command, then publish revision-bound PDF, SVG, full-size PNG, and 60% PNG plus structured command evidence for the same current revision."
      },
      {
        "id": "step-6",
        "text": "Have visioner independently compare the same current revision's latest full-size and 60% raster renders with the semantic figure spec and asset manifest, checking semantic completeness, direction and branch labels, overlap, clipping, crossings, hierarchy, icon legibility, and every raster disclosure."
      },
      {
        "id": "step-7",
        "text": "Main performs finding disposition. For each material finding accepted by Main, give designer one bounded new revision, rerun the fixed renderer, and request at most one fresh affected visioner review of the changed current revision; never review an unchanged artifact or continue automatically."
      },
      {
        "id": "step-8",
        "text": "Report the final project-owned TikZ source, semantic figure spec, asset manifest, revision-bound compile and render evidence, independent review verdict, raster disclosures, and unresolved limitations; no verdict decides completion or publication."
      }
    ],
    "scopeNotes": [
      ...VISUAL_AGENT_SCOPE_NOTES,
      "The pinned OpenTikZ library is read-only; copy selected content into the declared user-project target before editing it.",
      "Main retains exclusive ownership of optional OMP imagegen calls, host permission and external-effect decisions, prepared-asset acceptance, integration, and final verification; designer and visioner do not gain that authority.",
      "Imagegen is optional and its visibility or activation is not permission, a workflow requirement, or a reason to invent an asset; a native TikZ or OpenTikZ fallback remains valid.",
      "The fixed renderer never runs a user-supplied or project-configured command and never treats compile success as visual approval.",
      "Direct standalone SVG authoring remains diagram.svg; an SVG preview rendered from editable TikZ remains evidence for diagram.tikz.",
      "This card creates no gate, router, permission, completion controller, retry, or automatic correction loop; Main owns disposition and may leave supported limitations visible."
    ],
    "skills": [
      "tikz-diagram"
    ],
    "qualityChecks": [
      "semantic completeness and stable IDs, OpenTikZ edit-contract and dependency preservation, asset provenance and portability, safe standalone compile, revision-bound PDF and SVG, current-revision full-size and 60% raster evidence, independent visual review, icon legibility, explicit raster disclosure, Main finding disposition, and requested paper or slide fit"
    ],
    "riskNotes": [
      "Generated raster icons reduce all-vector scalability and remain separate project assets whose provenance and raster status must stay visible.",
      "Brand marks and other third-party assets may carry trademark or usage restrictions even when source graphics are reusable."
    ],
    "roles": [
      "designer",
      "visioner"
    ],
    "delegation": [
      "step-2: designer owns bounded OpenTikZ discovery, copy selection, semantic figure spec, asset manifest, and missing-icon identification without modifying the library",
      "step-4: designer owns the project TikZ source and manifest-listed asset integration while preserving the selected edit contract",
      "step-6: visioner independently reviews the fresh full-size and 60% raster evidence for the current revision against the supplied spec and manifest",
      "step-7: designer applies only Main-accepted findings, while visioner performs at most one fresh affected review after rerendering"
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
      }
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
      "task"
    ],
    "delegation": [
      "step-2: task owns only a bounded format-only conversion and Markdown-structure preservation slice; for prose changes, prefer the writer from the composed writing.zh or writing.en workflow",
      "step-3: prefer the composed language checker for prose review; task may return bounded structure evidence, while the parent reconciles Markdown scope"
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
      }
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
      "task"
    ],
    "delegation": [
      "step-3: task owns only a bounded format conversion and document-structure preservation slice; for prose changes, prefer the writer from the composed writing.zh or writing.en workflow",
      "step-4: prefer the composed language checker for revised prose; task may return bounded structure evidence, while the parent reconciles document scope and visual review"
    ]
  }
];
