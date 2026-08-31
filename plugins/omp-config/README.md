# OMP Config

`omp-config` packages shared OMP workflow references, configuration templates, the read-only `visioner` Agent, notify-only hooks, and configuration diagnostics.

## Contents

- `assets/WORKFLOW_CATALOG.md` is generated from `scripts/workflow-definitions.js` and contains the three advisory workflow cards for catalog v38.
- `skills/omp-enhancer-workflows/` publishes the compact domain index and on-demand `writing`, `research`, and `visual` reference cards.
- `skills/latex-beamer-slides/` and `skills/slides-storyline/` define the staged Beamer deck workflow. `skills/beamer-to-powerpoint/` handles conversion only when the user supplies an exact command.
- `skills/frontend-design/`, `skills/canvas-design/`, and `skills/docx/` are adjacent visual or document methods, not native PPTX generators.
- `agents/visioner.md` is a read-only visual reviewer for current slide renders, UI screenshots, and static exports.
- `assets/AGENTS.md` and `assets/WATCHDOG.yml` contain compact advisory context. They do not import the full workflow catalog or create runtime gates.
- `assets/config.yml` and `assets/mcp.json` are templates. Model selection remains with OMP and the user.
- `hook-templates/` contains optional helpers and is not auto-discovered.
- Runtime tools are default-inactive: `omp_config_doctor`, `omp_config_assets`, `omp_config_plan`, and `omp_config_sync_workflow_context`.

## Staged Beamer/PPT workflow

Beamer is a `writing` format overlay, not the `visual` workflow.

1. **Text-only content in a Markdown content plan.** Build the deck in section-sized batches and discuss every page with the user. Persist each page's title, narrative job, detailed body, evidence or source basis, and prose visual role in a Markdown content-plan file. The Markdown content plan is the canonical content source; do not create or edit Beamer .tex frames while content is unresolved. Body text, captions, and explanations use complete natural-language sentences or paragraphs rather than isolated phrases or keyword strings. Chinese text uses `plain-chinese-writing`, `zh-format-humanizer`, and `zh-writing-review` when available.
2. **Beamer translation, visual authoring, and basic layout.** Only after the user confirms the page content in the Markdown content plan, translate it into Beamer frames, add or create the visual asset for each page, and establish the base composition. The Beamer .tex files are derived layout artifacts, not a second content source; do not rewrite, shorten, or add content in .tex. If content changes, edit Markdown first, reconfirm the affected pages, and regenerate Beamer before layout resumes. After the first complete layout is rendered, ask the user to confirm the basic layout direction.
3. **Layout refinement.** After basic-layout confirmation, use the existing current-revision visual evidence chain: one advisory precheck owned by Main or task, designer layout without changing confirmed content, task integration and fresh rendering, and independent visioner review. Supported findings may receive the existing bounded fix and fresh-review pass; no automatic repair loop is created.

PowerPoint conversion is conditional. The user must provide the exact conversion command. The plugin does not choose LibreOffice, Pandoc, an online converter, or another replacement, and it does not claim editability or visual fidelity without checking the output.

## Runtime boundaries

- OMP remains authoritative for tools, permissions, approvals, delegation, and completion.
- Workflow cards and review findings are advisory. They do not route, block, grant permission, or decide completion.
- `writer` and `zh-writer` assignments remain proposal-only; Main or an explicitly capable native Agent owns authorized file effects.
- `visioner` is read-only and returns `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for the supplied current revision.
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

Do not hand-edit generated workflow assets. Keep the catalog version and current documentation synchronized.
