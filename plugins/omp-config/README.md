# OMP Config

`omp-config` packages shared OMP workflow references, configuration templates, notify-only hooks, and configuration diagnostics.

## Contents

- `assets/WORKFLOW_CATALOG.md` is generated from `scripts/workflow-definitions.js` and contains the three advisory workflow cards for catalog v44.
- `skills/omp-enhancer-workflows/` publishes the compact domain index and on-demand `writing`, `research`, and `visual` reference cards.
- `skills/latex-beamer-slides/` and `skills/slides-storyline/` define the staged Beamer deck workflow. `skills/beamer-to-powerpoint/` provides an optional PPTX branch backed by the fixed external `beamer2pptx` Skill/repository (`https://github.com/xdmlxdml/beamer2pptx/tree/main/beamer2pptx`) after the final validated Beamer visual revision when PowerPoint output is in scope; it consumes the final validated Beamer PDF and corresponding `.tex`, macro, and font sources when available.
- `skills/frontend-design/` and `skills/canvas-design/` are adjacent visual methods, not native PPTX generators. `skills/docx/` drives the officecli-backed Office flow: `.docx`/`.xlsx`/`.pptx` create, read, edit, validate, and rendered preview through a single external binary.
- `assets/AGENTS.md` and `assets/WATCHDOG.yml` contain compact advisory context. They do not import the full workflow catalog or create runtime gates.
- `assets/config.yml` and `assets/mcp.json` are templates. `config.yml` ships model role defaults; model selection remains overridable by OMP and the user.
- `hook-templates/` contains optional helpers and is not auto-discovered.
- Runtime tools are default-inactive: `omp_config_doctor`, `omp_config_assets`, `omp_config_plan`, and `omp_config_sync_workflow_context`.

## Staged Beamer/PPT workflow

Beamer is a `writing` format overlay, not the `visual` workflow.

## Global text-author boundary

All prose/copy in the writing, research, and visual workflows—including drafting, rewriting, translation, titles, body text, captions, labels, narrative prose, and UI copy—must come from the dedicated language-matched text tool: `writer` (English) or `zh-writer` (Chinese); mixed-language deliverables dispatch both as needed. These are dedicated text tools, not independent general-purpose agents, and they grant no code or file permissions; the current OMP ExtensionAPI exposes `registerTool` for command tools only and no plugin-invocable model API, so the host's packaged Agent files (with their existing frontmatter/model/tool metadata) serve as the compatibility adapter for these tools. Main only detects the target body language, dispatches the text tool, passes constraints, integrates the returned proposal verbatim, and performs final acceptance; Main and `task` retain code and all non-text actions (evidence, structure, layout, conversion, validation, file mechanics). Main must not draft, rewrite, polish, or replace the writer.

`writer`/`zh-writer` are proposal-only: they return complete text or a bounded diff and do not write files. Main may only persist or apply an authorized proposal exactly as returned. `task`, research, and visual agents may collect evidence, reorder structure, draw, lay out, convert, use OfficeCLI, and inspect visuals, but they may not author or change copy; any text change returns to the matching writer. Layout, conversion, OfficeCLI application, and visual review of Beamer/Word/PPT/PPTX may remain with Main or task only when they mechanically integrate the approved text.

Substantive drafting, logical/semantic revision, translation, and polishing start with a call to the language-matched `writer`/`zh-writer` text tool. Resolve logic and evidence before sentence polish; the tool proposal precedes a `checker`/`zh-checker` report of logic, evidence, and style findings. Checker is report-only, substantive repair returns to the same language-matched text tool, and Main performs mechanical integration and final acceptance only. Main, `task`, and checker never rewrite prose; if the matching text tool cannot be safely called, record the limitation rather than silently drafting through another role.

For PPT/Beamer titles, body text, captions, labels, notes, and narrative copy, `writer`/`zh-writer` remains the sole text author. `task` handles structural/layout/conversion-only work for PPT text: placing approved copy, reconciling order, rendering, converting, validating, and inspecting visuals. It must not draft, rewrite, translate, or polish wording; copy changes return to the matching writer.

PPT copy avoids announcer transitions such as `The real question is`, `A new question is`, `This raises a deeper question`, `Let us turn to`, `新的问题是`, `真正的问题是`, `这就引出了一个更深的问题`, and `接下来我们看`; facts or a concrete dependency carry the transition. It also avoids hollow unsupported significance claims such as `this is important/significant/transformative`, `this demonstrates the power/value`, `意义重大`, `具有重要意义`, `标志着`, `彰显了`, `开创了`, and `充分说明`. Replace or remove them in favor of concrete evidence, scope, or source. Retain significance/evaluation only as an evidence-backed exception when that support is stated.

1. **Text-only content in a Markdown content plan.** Build the deck in section-sized batches and discuss every page with the user. Persist each page's title, narrative job, detailed body, evidence or source basis, and prose visual role in a Markdown content-plan file. The Markdown content plan is the canonical content source; do not create or edit Beamer .tex frames while content is unresolved. Body text, captions, and explanations use complete natural-language sentences or paragraphs rather than isolated phrases or keyword strings. Chinese text uses `plain-chinese-writing`, `zh-format-humanizer`, and `zh-writing-review` when available; English text uses `format-humanizer` and `writing-review`.
2. **Slide-order reconciliation.** After the user confirms the Markdown content plan and before any Beamer frame is generated, a separate task reconciles the slide order on the plan: no content overlap between slides, semantically coherent content modules with one main job per slide, and a logical overall progression from context to conclusion. Crossings that reordering or regrouping cannot fix (duplicated or split content) are reported and return to the Markdown reconfirmation path. Reordering edits only the Markdown content plan, never .tex.
3. **Mechanical Beamer integration, visual authoring, and basic layout.** Only after the user confirms the page content and the slide order is reconciled, mechanically place the writer-approved Markdown content plan into Beamer frames, add or create the visual asset for each page, and establish the base composition. The Beamer .tex files are derived layout artifacts, not a second content source; do not rewrite, shorten, or add content in .tex. If content changes, return to the matching writer, update the Markdown plan with the returned text, reconfirm the affected pages, and regenerate Beamer before layout resumes. After the first complete layout is rendered, ask the user to confirm the basic layout direction.
4. **Layout refinement.** After basic-layout confirmation, use the existing current-revision visual evidence chain: one advisory precheck owned by Main or task, task layout without changing confirmed content, task integration and fresh rendering, and a single read-only visual review of the fresh renders. Supported findings may receive the existing bounded fix and fresh-review pass; no automatic repair loop is created.

PowerPoint conversion is an optional branch after the final validated Beamer visual revision and only when PPTX output is in scope. The fixed external `beamer2pptx` Skill/repository (`https://github.com/xdmlxdml/beamer2pptx/tree/main/beamer2pptx`) is the only converter; do not substitute another converter. The source contract is the final validated Beamer PDF plus available corresponding `.tex`, macro, and font sources; conversion does not edit Markdown, Beamer, formulas, figures, slide order, or page structure. One producing `task` binds a single current PPTX revision and renders it; one independent read-only reviewer (Main or a task that did not produce the revision) checks current renders for slide count/order, editability where supported, clipping/overflow, overlap, margins/alignment, hierarchy/fonts, aspect ratio, raster/vector treatment, and visual fidelity. The producing task may apply at most one bounded layout-only fix to the editable PPTX, preserving visible content, formulas, slide order, and Markdown/Beamer sources, then rerenders fresh evidence for the same reviewer to confirm once. Content or page-structure findings return to the Markdown plan and Beamer regeneration path. Findings remain advisory: this chain does not route, block, grant permission, decide completion, launch an automatic repair loop, or silently fall back to another converter.

## External dependencies

Office document skills (`.docx`/`.xlsx`/`.pptx` via the `docx` skill) require the
[officecli](https://github.com/iOfficeAI/OfficeCLI) binary. OMP's plugin install
does not run npm lifecycle scripts, so dependency installation is explicit:

```bash
npm run setup:deps -w plugins/omp-config   # repo checkout
bash <installed-plugin>/scripts/install.sh # installed plugin directory
```

The script is idempotent: it checks the environment, installs what is missing,
and exits 0 when everything is present. `--check` reports without installing.
At session start the plugin probes `officecli --version` (read-only; no install,
no writes) and warns once when it is missing
(`OMP_ENHANCER_DISABLE_CONFIG_AUTO_SYNC=1` silences it), and
`omp_config_dependency_check` reports the same state on demand.

## Runtime boundaries

- OMP remains authoritative for tools, permissions, approvals, delegation, and completion.
- Workflow cards and review findings are advisory. They do not route, block, grant permission, or decide completion.
- `writer`/`zh-writer` are the only text authors for every prose/copy change (drafting, rewriting, translation, titles, body, captions, labels, narrative, and UI copy), routed by target body language. They are dedicated language-matched text tools—packaged Agent files serve as their host compatibility adapter because the current ExtensionAPI offers `registerTool` for command tools only—not second general-purpose agents—and they grant no code or file permissions. They remain proposal-only; Main only dispatches them and integrates the returned text verbatim, with no direct/minor-edit fallback. `task`, research, and visual agents do not replace them; Main and `task` keep code and non-text actions.
- The visual review is performed read-only by exactly one owner—Main, or a task that did not produce the revision—and returns advisory findings only.
- Extension tools are inactive by default. `/enhancer-tools enable <config|writing|fact|all>` exposes schemas but does not grant permissions.

## Configuration sync

`omp_config_sync_workflow_context` defaults to dry-run. It preserves content outside managed markers in target `AGENTS.md` and `WATCHDOG.yml`, refuses unsafe symlinked destinations, and only applies changes when `apply: true` is explicit. Session-start synchronization is idempotent and non-fatal.

## Development

After changing workflow definitions or renderers, run:

```bash
npm run generate:workflows
npm run check:workflows
npm test --workspace plugins/omp-config
npm run check:marketplace
```

Generated workflow assets are produced only after all workflow source files are complete, by Main running `npm run generate:workflows` exactly once. Tasks do not run the generator or edit generated assets; Main may perform subsequent check-only parity without rerunning generation.

Do not hand-edit generated workflow assets. Keep the catalog version and current documentation synchronized.
