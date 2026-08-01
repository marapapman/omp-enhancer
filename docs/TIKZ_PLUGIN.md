# TikZ Helper Design and E2E Plan

This document defines the implementation contract for the `tikz-helper` marketplace plugin. OpenTikZ is integrated as a pinned, read-only content snapshot; OMP remains responsible for workflow selection, tools, approvals, delegation, and completion.

New academic architecture, block-diagram, flowchart, decision-flow, and deploy-pipeline figures default to the Mermaid code-first pipeline (`diagram.mermaid` + `mermaid_render`); see [MERMAID_PIPELINE.md](./MERMAID_PIPELINE.md) for that pipeline's contract. This document keeps the ELK-first TikZ contract verbatim for the explicit editable-TikZ path.

## Goals

- Add one specialized `diagram.tikz` workflow and one top-level `tikz-diagram` Skill.
- Reuse the current `designer` and `visioner` Agent candidates instead of adding another role family.
- Preserve OpenTikZ templates, icons, examples, metadata, previews, edit contracts, and licenses at an exact upstream commit.
- Generate editable TikZ from a semantic node-and-edge contract, then validate and review fresh rendered evidence.
- Use OMP's native `generate_image` only as an optional source of missing node icons. The ELK graph IR is the sole source of node positions and edge geometry. TikZ and the figure text remain the authority for topology, labels, and connectors; the layout engine computes every coordinate.
- Keep all plugin tools advisory. Do not add a router, gate, completion controller, hook, slash command, or automatic repair loop.

## Non-goals

- Runtime `git clone`, `git pull`, or another mutable dependency on upstream `main`.
- Pixel-perfect raster tracing or a claim that embedded raster icons became vectors.
- A second image-generation implementation, a TikZ-specific Agent fleet, or separate workflows for icons, templates, layout, and rendering.
- Arbitrary shell commands, `-shell-escape`, TikZ externalization, remote includes, or execution of instructions embedded in source text.

## Upstream boundary

The initial snapshot is OpenTikZ commit `359befbf8e8af7ce08e7e387b2c2a198e0ca735d`. `vendor/opentikz/UPSTREAM_LOCK.json` records the repository, commit, imported paths, file hashes, and license split. Runtime code never contacts GitHub. Updating the snapshot is an explicit developer action that accepts an exact commit and reruns catalog, hash, license, and package checks.

OpenTikZ code and tools remain under MIT. Graphic `.tex` sources, metadata, and previews remain under CC0-1.0. Brand-icon notices remain bundled and visible; neither OpenTikZ content licensing nor this plugin grants trademark rights. Provider-generated assets use a separate project-local provenance record and are never labeled as OpenTikZ CC0 content.

## Plugin surface

The plugin has one top-level Skill, `tikz-diagram`, with directly linked references for the OpenTikZ edit contract, semantic flowchart method, image assets, and render review. The Skill stays compact; detailed methods are read only when selected.

The initial tool group is `tikz`, active by default when the plugin loads (disable via `/enhancer-tools disable tikz` if needed):

- `tikz_catalog_search` (`read`): search the pinned catalog and return bounded structured candidates, including source, metadata, preview, and edit-contract data.
- `tikz_prepare_asset` (`exec`): validate a local PNG/JPEG/WebP image, normalize it through fixed bounded ImageMagick arguments to a project-local PNG, name it by content hash, and update an asset manifest. It never invokes imagegen or a network provider.
- `tikz_render` (`exec`): validate a project-local TikZ source, run fixed no-shell-escape pdfLaTeX compilation and conversion using argument arrays, and return current-revision PDF/SVG/full-size/60%-scale evidence.
- `tikz_generate_diagram` (`read`): accept an ELK graph IR, compute node positions and edge geometry via elkjs, and emit a compilable standalone TikZ source. It is the sole tool that produces figure geometry; input nodes omit `x`/`y` and input edges omit `sections`/`bendPoints`. If ELK is not installed, tikz_generate_diagram returns ELK_NOT_INSTALLED with install instructions; install elkjs and regenerate from the ELK graph IR rather than hand-authoring TikZ coordinates. tikz_generate_diagram also returns the positioned ELK graph IR as standard ELK JSON; write it to a project-local .elk.json to edit in an ELK-compatible visual editor, then feed the edited IR back into tikz_generate_diagram to regenerate the TikZ.

Tools are active by default. Deactivation via /enhancer-tools does not grant or revoke filesystem, command, network, provider, or publication permission. Findings are structured evidence, not completion permission.

## Semantic figure contract

`figure.spec.json` is an OMP-side contract and does not modify OpenTikZ metadata. It records:

- figure identity, purpose, reading direction, target dimensions, fixed pdfLaTeX compatibility, and output formats;
- stable nodes with type, label, icon, group, rank hints, and accessible description; rank hints translate into ELK IR layoutOptions (e.g. layered constraints), not hand-authored coordinates;
- stable edges with source, target, label, branch/loop semantics, and preferred ports; preferred ports translate into ELK IR port constraints, not manual edge routing;
- groups or swimlanes, theme, legend, and color-independent encodings;
- selected OpenTikZ item and upstream commit. OpenTikZ is an icon and semantic reference source only. The selected item may supply an icon graphic or a semantic example; its template geometry is never copied into the figure;
- local generated-asset paths and provenance.

The Skill's semantic review checks duplicate node IDs, dangling endpoints, unlabeled decision branches, unreachable nodes, missing assets, and inconsistent semantic references. `tikz_render` separately validates source and asset paths plus the fixed local toolchain. These checks are evidence for Main; neither decides whether Main may continue or finish.

## Media presets and density control

`tikz_generate_diagram` accepts optional `preset`, `density`, and `targetWidthPt` parameters to adapt layout to the target medium.

| Preset | Direction | Spacing scale | Min node | Padding | Font | Target width | Aspect ratio |
|--------|-----------|--------------|----------|---------|------|-------------|-------------|
| paper-column | DOWN | 0.85× | (60,30) | 16pt | 9pt | 240pt | — |
| paper-full | RIGHT | 1.0× | (80,40) | 20pt | 10pt | 504pt | — |
| slide-16-9 | RIGHT | 1.3× | (120,56) | 28pt | 14pt | — | ≈1.78 |
| slide-4-3 | RIGHT | 1.3× | (110,52) | 26pt | 14pt | — | ≈1.33 |

**Merge order (later wins):** SERVER defaults ← preset ← tool `layoutOptions` ← graph-level `layoutOptions`.

**Density guard:** Automatic relayout (at most 2 iterations) that scales spacing when the fill ratio (occupied / total area) exceeds 0.60 (expand by ×1.25) or falls below 0.15 (compact by ×0.8, only when nodeCount ≥ 4). Only spacing keys change; topology, direction, and algorithm are untouched.

**Sizing formula:** `scale = targetWidthPt / root.width` (snapped to 1 when within ±2%). Effective font = fontPt × scale. A warning is emitted when effective font < 6pt.

**Determinism:** `elk.randomSeed: 1` is set in server defaults so all layouts are reproducible.

All warnings and density adjustments are advisory only. The tool returns `metadata.density` (fillRatio, adjustments, relayout count) and `metadata.sizing` (target width, intrinsic dimensions, scale, effective font, embedding hint).

## Workflow contract

`diagram.tikz` is the single Primary path for standalone editable TikZ and LaTeX diagrams explicitly requested via TikZ or LaTeX source; academic architecture, block-diagram, flowchart, decision-flow, and deploy-pipeline figures default to `diagram.mermaid`, the Mermaid-first pipeline described below. It is an Add-on to `slides.generate` or `slides.modify` when a deck is the central deliverable. SVG is an icon asset and compatibility supplement, not a parallel primary: an SVG icon asset is a node pictogram embedded in the TikZ figure, and an SVG preview or export is rendered evidence or compatibility output for `diagram.tikz`. Exported SVG or PNG never selects a standalone SVG workflow and never replaces the TikZ main figure. `writing.latex` is composed only for an independently requested prose, template, conversion, or format operation.

The subagent-driven card performs a phased icon-before-layout workflow. The asset chain runs before the figure chain:

1. Freeze the semantic figure contract, target paths, fixed pdfLaTeX compatibility, dimensions, icon policy, and evidence requirements.
2. `designer` owns one icon plan per node that needs an icon: source (OpenTikZ vector icon, imagegen pictogram, or native TikZ/text fallback), requested square size and padding, owning node ID, and at least one alternative when the preferred source may be unavailable.
3. `task` prepares each planned asset through `tikz_prepare_asset` and exposes a preview set (e.g. `tikz_preview_assets`) with each entry bound to its `nodeId`, size, padding, declared source, and fresh full-size and 60% raster previews.
4. `visioner` reviews the preview set per asset and returns `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for each entry. Only approved icons enter the asset manifest; a `CHANGES_REQUIRED` asset returns to `designer` for one bounded revision and `visioner` reviews only the fresh rerendered asset, at most once. An asset that remains unapproved falls back to a native TikZ or text-backed node.
5. After asset review: Author the semantic graph as an ELK IR and call tikz_generate_diagram to compute the layout with ELK. The tool emits the standalone TikZ source; the ELK graph IR is the sole source of node positions and edge geometry, the author never authors, infers, or hand-edits TikZ coordinates, and never calls `tikz_generate_diagram` with unreviewed or unsubstituted icon assets.
6. Search OpenTikZ for an optional icon or semantic reference only; do not copy template geometry into the figure. The selected item may supply an icon graphic or a semantic example, never figure coordinates.
7. Size each node to fit its exact label plus padding, set graph-level ELK layoutOptions (algorithm, direction, edge routing), and regenerate from the IR. Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates. Keep icon and label nodes separate; keep topology, text, and connectors in TikZ.
8. `task` invokes the fixed `tikz_render` renderer: validate semantics and source safety, compile and render the current revision at full and 60% scale, and publish revision-bound PDF, SVG, full-size PNG, and 60% PNG evidence.
9. `visioner` independently reviews only those current-revision whole-figure renders against the semantic spec and approved manifest.
10. A supported visioner finding may produce one bounded designer repair and at most one fresh affected visual review, with `task` re-rendering for each revision.
11. Deliver `.tex`, semantic spec, local assets and manifest, current renders, commands/evidence, assumptions, alt text, and unresolved limitations.

For `diagram.tikz`, the normal compiled dependency chain has two stages. The **asset chain** is `designer` (icon plan) -> `task` (prepare and preview assets) -> `visioner` (per-asset review) when the matching Agents are exposed, assignment input is complete, and delegation is safe. The **figure chain** is `designer` (ELK graph IR and `tikz_generate_diagram` layout) -> `task` (`tikz_render`) -> `visioner` (whole-figure review). The asset chain runs before the figure chain: only `visioner`-approved assets enter the manifest, and `tikz_generate_diagram` is called only after asset review. The `designer`-`task`-`visioner` loop resolves findings without Main mediation. Main authorizes external-effect decisions during initial setup and accepts final delivery.

The same ownership pattern applies across the current non-simple visual workflows: `design.visual`, `diagram.tikz`, `slides.generate`, and `slides.modify` use `designer` for a complete design or revision checkpoint, `task` for rendering and optional imagegen, and `visioner` for a fresh current-revision render check. `diagram.tikz` additionally runs the asset chain before the figure chain. Main authorizes external-effect decisions during setup and accepts final delivery, but does not mediate the visual loop. Each selected workflow still supplies its own medium-specific spec, renderer, evidence, and acceptance criteria; this pattern does not collapse those workflows into TikZ.

If designer is unavailable, the affected TODO and final evidence preserve the precise unfulfilled checkpoint and permitted Agent-availability fallback; Main does not silently relabel its own work as designer evidence. If visioner is unavailable, record missing independent current-revision visual evidence. Compile, source, and static checks, designer self-review, and Main self-review do not replace that evidence. These are explicit evidence gaps rather than host enforcement: no dispatch, fixed fanout, routing, retry, permission, or completion decision is created by the Skill or workflow card.

## Mermaid-first diagram pipeline

Academic architecture, block-diagram, flowchart, decision-flow, and deploy-pipeline figures default to the Mermaid code-first pipeline: the `diagram.mermaid` workflow card selects the `mermaid-diagram` method, the author writes Mermaid source as code, `task` calls `mermaid_render` to convert that source to a revision-bound SVG, and `visioner` independently reviews the fresh current-revision render. Within `diagram.mermaid` the revision-bound SVG is the primary figure deliverable; the SVG-as-icon-asset-and-supplement statements above are scoped to the explicit-TikZ `diagram.tikz` path and do not apply to the Mermaid pipeline.

`diagram.tikz` remains for editable TikZ explicitly requested via TikZ or LaTeX source, with the ELK graph IR staying the sole geometry authority on that path. The Mermaid pipeline does not modify the `tikz_*` tools, the pinned OpenTikZ snapshot, or any frozen ELK-first phrase in this document; the TikZ contract above stays verbatim and honest.

The full `mermaid_render` contract — parameter surface, source validation, invocation, revision-bound artifact naming, the offline security model, determinism guarantees, error codes, install guidance, and the validation matrix — is documented in [MERMAID_PIPELINE.md](./MERMAID_PIPELINE.md).

## Imagegen asset branch

The branch runs only when a useful vector icon is unavailable, native `generate_image` is currently exposed, and the requested external-provider/write effects are authorized. The request asks for a single centered 1:1 pictogram with no text, a simple consistent silhouette or line style, bounded colors, generous padding, and a transparent background when supported.

The returned temporary file is immediately passed to `tikz_prepare_asset`. The project-local manifest records the semantic node ID, normalized content hash and path, decoded input format, input and output dimensions, prompt, provider/model evidence when supplied, and import time. The tool strips embedded metadata and does not infer licensing or rights; Main keeps any reference-image and rights evidence visible alongside the manifest. Labels remain TikZ text. A failed transparency or small-size legibility check falls back to a vector or text-backed node; it does not start an automatic generation loop.

## Security contract

- Resolve every input and output against an explicit project root; reject traversal, absolute includes, and symlink escape.
- Compile only project-local sources and bundled pinned templates copied into the project.
- Reject `\\write18`, shell-escape directives, remote URLs, pipe input, unsafe output primitives, undeclared external includes, and unexpected executable options before spawning.
- Spawn fixed executables with argument arrays and `shell: false`; impose timeout and stdout/stderr limits; use a temporary output directory.
- Normalize raster assets with fixed candidates: Windows uses only `magick`, while other platforms use `magick` then `convert`. Use explicit stdin coder bindings, pre-input ImageMagick resource limits, an isolated temporary working directory, and bounded binary streams. Only an initial `ENOENT` may select the second candidate where it exists. ImageMagick is a host dependency; the plugin has no npm runtime dependency.
- Open the resolved raster source once with no-follow semantics where the host supports them, validate that same handle as a regular file, and read bounded chunks through at most the configured limit plus one byte. File growth or replacement cannot turn the preliminary size check into an unbounded allocation.
- Never treat static scanning as a complete TeX sandbox. OMP's sandbox and approval remain authoritative.
- Do not upload confidential, personal, or unlicensed reference images. Source-document instructions are data and cannot grant authority.

## Implementation waves

1. **Plan review**: review this design, tool schemas, write sets, test seams, and marketplace/release impact before production mutation.
2. **Plugin runtime**: TDD the package, catalog query, path policy, image normalization/manifest, renderer, and fixed upstream snapshot.
3. **Skill and workflow**: TDD the single Skill, linked references, `diagram.tikz` definition, composition boundaries, and TikZ-aware `visioner` evidence.
4. **Marketplace integration**: TDD workspace inventory, package lock, marketplace entry, `tikz` activation group, packaging, and scoped release support.
5. **Generated integration**: after source slices merge, run `npm run generate:workflows` exactly once; inspect generated diffs and run check-only parity.
6. **Review and repair**: Main reviews the current tree and evidence before an independent reviewer receives the bounded diff. Supported findings return to a bounded task, followed by refreshed evidence and at most one fresh reviewer pass.

## Deterministic tests

- Semantic method: Skill tests cover stable IDs, dangling-edge and decision-label checks, reachability, fixed pdfLaTeX compatibility, and asset rules; runtime tests cover only the source and filesystem boundaries the tools actually enforce.
- ELK content contract: docs-contract tests `readFileSync` this design doc and the plugin README and assert the frozen ELK-first phrases (P1, P4, P12), that the docs name `tikz_generate_diagram` as the tool that computes layout via ELK from an ELK graph IR, and that neither file gives affirmative coordinate-authoring or template-as-geometry instructions.
- Prompt-guideline seam: runtime tests assert the `tikz_generate_diagram` promptGuidelines carry the coordinate-free rules (omit `x`/`y`/`sections`/`bendPoints`, graph-level `layoutOptions`, node sizing, regeneration-not-coordinates, arrow/line style, no `fixed`/`random`).
- Paths and TeX: traversal, symlink escape, absolute includes, remote URLs, `\\write18`, pipe input, timeout, output cap, and no shell invocation.
- Assets: PNG/JPEG/WebP fixtures, decoded-format mismatch, image limits, deterministic PNG/hash naming, metadata removal, manifest merge, acceptance of imagegen-style temporary inputs, and publication only to a project-local final path.
- Tools: exact names, approval classes, active-by-default registration, normalized parameters, structured details, and advisory findings.
- Workflow: `diagram.tikz` trigger and composition boundaries, one Skill, designer/visioner delegation, optional imagegen, current-revision render evidence, and no gate/router language.
- Inventory: workspace, lockfile, marketplace order, global Skill uniqueness, pack contents, and scoped version changes.
- E2E evidence parsing: linked `skill://.../references/...` reads remain method-resource evidence and are not misclassified as separate Skill identities.

## End-to-end tests

1. Generate a figure from an ELK graph IR via `tikz_generate_diagram` (sized nodes, graph-level `layoutOptions`); compile PDF and render SVG/full/60% PNG evidence without hand-authoring any `\node at`/`\draw` coordinate.
2. Produce a pure-vector flowchart when imagegen is unavailable.
3. Feed a mocked imagegen WebP/PNG result through asset preparation; verify project-local hash path, manifest, `graphicx` inclusion, compilation, and self-contained delivery.
4. Reject a malicious or escaping TikZ fixture without launching the compiler.
5. Verify `visioner` reviews the latest revision and a supported finding produces only a bounded fresh revision/review.
6. Install the worktree marketplace, confirm `tikz-diagram` discovery, confirm `tikz_*` tools are active by default and can be disabled via `/enhancer-tools disable tikz`, and verify cache-backed Skill symlinks.
7. Run a live workflow canary (any user-configured Main model) for PLAN/READY, one Skill load, subagent dispatch when available, complete terminal delivery, and parent verification. Treat model behavior as a sample, not a deterministic release guarantee.
8. Run one explicitly authorized live imagegen canary only when provider configuration is available; exclude it from ordinary CI and release gates.

## Validation and release

Focused checks run before root checks. The final deterministic validation is:

```bash
npm test --workspace plugins/tikz-helper
npm test --workspace plugins/omp-enhancer-core
npm test --workspace plugins/omp-config
npm run check:workflows
npm run check:ecc-skills
npm test
npm run check:marketplace
npm run pack:all
git diff --check
```

Host runtime dependencies are ImageMagick (`magick` is required on Windows; other platforms may use `magick` or `convert`) for asset normalization and `latexmk`, `dvisvgm`, and `pdftocairo` for rendering. Missing executables are reported as structured limitations rather than replaced with project-controlled commands.

Only `tikz-helper`, `omp-enhancer-core`, and `omp-config` require plugin releases unless the implemented diff changes another package. Push, marketplace refresh, and local upgrade remain separate explicitly authorized actions.
