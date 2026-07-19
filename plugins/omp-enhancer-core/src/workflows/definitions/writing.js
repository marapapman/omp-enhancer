export const writingWorkflows = [
  {
    "id": "writing.pending",
    "chooseWhen": "Temporary Primary only when a named writing target has not been observed and its prose language is unknown; after one narrow source read, replace it with writing.zh or writing.en before substantive review or revision.",
    "composeWith": [
      "writing.latex",
      "slides.modify",
      "writing.markdown",
      "doc.convert.word"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Read the exact text or document section."
      },
      {
        "id": "step-2",
        "text": "Detect its body language."
      },
      {
        "id": "step-3",
        "text": "Compose writing.zh or writing.en with any format companion."
      },
      {
        "id": "step-4",
        "text": "Revise and review."
      }
    ],
    "scopeNotes": [
      "The instruction language is not evidence of the document language.",
      "Language-specific skills remain undecided until source text is available."
    ],
    "skills": [],
    "qualityChecks": [
      "preserve meaning, anchors, markup, and document structure"
    ],
    "riskNotes": [],
    "roles": [],
    "delegation": [
      "step-1: before the body language is observed, do not delegate to writer, checker, zh-writer, or zh-checker",
      "step-3: after detecting the body language, compose writing.zh or writing.en and use only that workflow's language-matched subagents"
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
      "writing.markdown",
      "doc.convert.word",
      "research.web",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Establish meaning, preservation constraints, and the bounded assignment."
      },
      {
        "id": "step-2",
        "text": "Draft or revise the requested natural Chinese prose within the established meaning and preservation constraints."
      },
      {
        "id": "step-3",
        "text": "Independently review the resulting revision for logic, tone, terminology, readability, and semantic drift without editing the source."
      },
      {
        "id": "step-4",
        "text": "Apply only parent-accepted findings once, then have the parent verify scope, voice consistency, semantic anchors, and requested format."
      }
    ],
    "scopeNotes": [
      "This workflow concerns prose rather than code implementation.",
      "When Main delegates, the language-matched writer owns prose edits and the checker remains independent and source-read-only; the parent always owns assignment boundaries and final reconciliation."
    ],
    "skills": [
      "plain-chinese-writing",
      "zh-writing-review",
      "zh-writing-polish",
      "zh-writing-checkers"
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
      "step-2: zh-writer owns the requested Chinese drafting or prose revision",
      "step-3: zh-checker independently reviews the resulting revision without editing the source",
      "step-4: zh-writer applies only parent-accepted findings once, then the parent verifies scope and semantic anchors"
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
      "writing.markdown",
      "doc.convert.word",
      "research.web",
      "factcheck.document"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Establish meaning, preservation constraints, and the bounded assignment."
      },
      {
        "id": "step-2",
        "text": "Draft or revise the requested English prose within the established meaning and preservation constraints."
      },
      {
        "id": "step-3",
        "text": "Independently review the resulting revision for logic, tone, terminology, formatting, readability, and semantic drift without editing the source."
      },
      {
        "id": "step-4",
        "text": "Apply only parent-accepted findings once, then have the parent verify scope, voice consistency, semantic anchors, and requested format."
      }
    ],
    "scopeNotes": [
      "This workflow concerns prose rather than code implementation.",
      "When Main delegates, the language-matched writer owns prose edits and the checker remains independent and source-read-only; the parent always owns assignment boundaries and final reconciliation."
    ],
    "skills": [
      "writing-review",
      "writing-checkers",
      "writing-markdown-helper"
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
      "step-2: writer owns the requested English drafting or prose revision",
      "step-3: checker independently reviews the resulting revision without editing the source",
      "step-4: writer applies only parent-accepted findings once, then the parent verifies scope and semantic anchors"
    ]
  },
  {
    "id": "writing.latex",
    "chooseWhen": "A requested writing, revision, or conversion source/output is LaTeX; compose with another matching format or prose workflow.",
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
        "text": "Read the relevant source and local macros."
      },
      {
        "id": "step-2",
        "text": "Preserve commands, comments, citations, math, labels, and revision markers."
      },
      {
        "id": "step-3",
        "text": "Make the requested change."
      },
      {
        "id": "step-4",
        "text": "Inspect the diff and compile when in scope."
      }
    ],
    "scopeNotes": [
      "Compilation and publication are separate workflow steps when requested."
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
    "roles": [],
    "delegation": [
      "step-3: for prose changes, use the writer from the composed writing.zh or writing.en workflow; keep format-only conversion language-neutral",
      "step-4: use the composed language checker for prose review; otherwise the parent owns compile evidence unless another explicitly composed workflow supplies an exact role"
    ]
  },
  {
    "id": "slides.generate",
    "chooseWhen": "The user wants a new LaTeX Beamer deck, with template and story decisions completed before frame authoring.",
    "composeWith": [
      "writing.zh",
      "writing.en",
      "writing.latex",
      "diagram.svg",
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
        "text": "Discuss the purpose, audience, duration, output language, and numbered story outline with the user and obtain confirmation."
      },
      {
        "id": "step-5",
        "text": "Generate Beamer frames from the confirmed template and outline, applying the PLAN-selected writing.zh or writing.en method for the agreed output language."
      },
      {
        "id": "step-6",
        "text": "Compile and render the draft deck, retaining an initial PDF and page images for the layout pass."
      },
      {
        "id": "step-7",
        "text": "Perform the final layout pass across the deck, correcting text and image overlap, crowding, clipping, undersized text, image cropping, alignment, spacing, and hierarchy without changing the confirmed story."
      },
      {
        "id": "step-8",
        "text": "Reconcile the layout revision against the confirmed outline, output language, source facts, semantic anchors, and LaTeX structure; restore unintended content or scope changes before rendering."
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
        "text": "For each material finding, produce a bounded new layout revision, have the parent reconcile content and scope, then recompile and create fresh renders before another independent visual review; use a maximum of three review rounds and never review an unchanged artifact."
      },
      {
        "id": "step-12",
        "text": "Only when the user supplied a conversion command, run it after the final Beamer revision passes independent visual review and verify the PowerPoint artifact."
      }
    ],
    "scopeNotes": [
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
      "template readiness, confirmed story outline, post-layout semantic and LaTeX preservation, output-language writing compliance, Beamer structure, zero unintended text and image overlap, no crowding or clipping, readable typography, undistorted images, balanced spacing, current-revision rendered evidence, compile evidence, and user-command conversion evidence when requested"
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
    "chooseWhen": "The user wants bounded wording, language, or existing-style changes to a current LaTeX Beamer deck.",
    "composeWith": [
      "writing.pending",
      "writing.zh",
      "writing.en",
      "writing.latex"
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
        "text": "For each material finding, make only the necessary bounded fix, have the parent reconcile semantics and scope, then recompile and create fresh rerenders before another independent visual review; use a maximum of three review rounds and report any unresolved limitation."
      }
    ],
    "scopeNotes": [
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
    "chooseWhen": "The user wants a standalone SVG workflow, process, block, or box diagram with strict monochrome geometry and rendered visual QA.",
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
        "text": "For each material finding, produce a new revision, rerun validation and rendering, then perform another independent visual review of that revision; use a maximum of three review rounds and relayout after repeated geometry failures."
      },
      {
        "id": "step-6",
        "text": "Deliver only after final source validation and current-revision rendered evidence; otherwise report the remaining layout or review limitation."
      }
    ],
    "scopeNotes": [
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
    "id": "writing.markdown",
    "chooseWhen": "A requested writing, revision, or conversion source/output is Markdown; compose with another matching format or prose workflow.",
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
      "Code mentioned inside prose does not by itself make this a code implementation task."
    ],
    "skills": [
      "writing-markdown-helper",
      "zh-writing-markdown-helper"
    ],
    "qualityChecks": [
      "Markdown structure, link and fence integrity, and consistent prose"
    ],
    "riskNotes": [],
    "roles": [],
    "delegation": [
      "step-2: for prose changes, use the writer from the composed writing.zh or writing.en workflow; keep format-only conversion language-neutral",
      "step-3: use the composed language checker for prose review while the parent reconciles Markdown structure"
    ]
  },
  {
    "id": "doc.convert.word",
    "chooseWhen": "The requested output is a Word document or a conversion to or from Word.",
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
    "roles": [],
    "delegation": [
      "step-3: keep pure conversion language-neutral; when prose changes are requested, use the writer from the composed writing.zh or writing.en workflow",
      "step-4: use the composed language checker for revised prose; otherwise the parent owns document-structure and visual review unless another explicitly composed workflow supplies an exact role"
    ]
  }
];
