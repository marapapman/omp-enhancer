# TikZ Helper Design and E2E Plan

This document defines the implementation contract for the `tikz-helper` marketplace plugin. OpenTikZ is integrated as a pinned, read-only content snapshot; OMP remains responsible for workflow selection, tools, approvals, delegation, and completion.

## Goals

- Add one specialized `diagram.tikz` workflow and one top-level `tikz-diagram` Skill.
- Reuse the current `designer` and `visioner` Agent candidates instead of adding another role family.
- Preserve OpenTikZ templates, icons, examples, metadata, previews, edit contracts, and licenses at an exact upstream commit.
- Generate editable TikZ from a semantic node-and-edge contract, then validate and review fresh rendered evidence.
- Use OMP's native `generate_image` only as an optional source of missing node icons. TikZ remains the authority for topology, labels, connectors, and layout.
- Keep all plugin tools opt-in and advisory. Do not add a router, gate, completion controller, hook, slash command, or automatic repair loop.

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

The initial tool group is `tikz`, exposed through `/enhancer-tools enable tikz`:

- `tikz_catalog_search` (`read`): search the pinned catalog and return bounded structured candidates, including source, metadata, preview, and edit-contract data.
- `tikz_prepare_asset` (`exec`): validate a local PNG/JPEG/WebP image, normalize it through fixed bounded ImageMagick arguments to a project-local PNG, name it by content hash, and update an asset manifest. It never invokes imagegen or a network provider.
- `tikz_render` (`exec`): validate a project-local TikZ source, run fixed no-shell-escape pdfLaTeX compilation and conversion using argument arrays, and return current-revision PDF/SVG/full-size/60%-scale evidence.

Every tool is `defaultInactive`. Activation does not grant filesystem, command, network, provider, or publication permission. Findings are structured evidence, not completion permission.

## Semantic figure contract

`figure.spec.json` is an OMP-side contract and does not modify OpenTikZ metadata. It records:

- figure identity, purpose, reading direction, target dimensions, fixed pdfLaTeX compatibility, and output formats;
- stable nodes with type, label, icon, group, rank hints, and accessible description;
- stable edges with source, target, label, branch/loop semantics, and preferred ports;
- groups or swimlanes, theme, legend, and color-independent encodings;
- selected OpenTikZ item and upstream commit;
- local generated-asset paths and provenance.

The Skill's semantic review checks duplicate node IDs, dangling endpoints, unlabeled decision branches, unreachable nodes, missing assets, and inconsistent semantic references. `tikz_render` separately validates source and asset paths plus the fixed local toolchain. These checks are evidence for Main; neither decides whether Main may continue or finish.

## Workflow contract

`diagram.tikz` is Primary for standalone editable TikZ, LaTeX diagrams, architecture diagrams, pipelines, and flowcharts. It is an Add-on to `slides.generate` or `slides.modify` when a deck is the central deliverable. Exported SVG or PNG remains rendered evidence of `diagram.tikz` and never selects `diagram.svg`. `writing.latex` is composed only for an independently requested prose, template, conversion, or format operation.

The subagent-driven card performs these stages:

1. Freeze the semantic figure contract, target paths, fixed pdfLaTeX compatibility, dimensions, icon policy, and evidence requirements.
2. Search the pinned catalog. Prefer an existing template and vector icon, then simple TikZ geometry, then the optional imagegen branch.
3. Copy the selected source into the user project and edit only the copy under its `edit_contract`.
4. Keep icon and label nodes separate. Keep topology, text, and connectors in TikZ.
5. Validate semantics and source safety; compile and render the current revision at full and 60% scale.
6. Have `visioner` independently review only those current-revision renders.
7. `task` renders the current revision. A supported visioner finding may produce one bounded designer repair and at most one fresh affected visual review, with `task` re-rendering for each revision.
8. Deliver `.tex`, semantic spec, local assets and manifest, current renders, commands/evidence, assumptions, alt text, and unresolved limitations.

For `diagram.tikz`, the normal compiled dependency chain is `designer` -> `task` -> `visioner` when the matching Agents are exposed, assignment input is complete, and delegation is safe. `designer` owns a complete design and source-revision checkpoint. `task` runs the fixed renderer and publishes revision-bound evidence. Only after task renders exist does `visioner` receive fresh full-size and 60% evidence for an independent read-only layout and legibility check. The `designer`-`task`-`visioner` loop resolves findings without Main mediation. Main authorizes external-effect decisions during initial setup and accepts final delivery.

The same ownership pattern applies across the current non-simple visual workflows: `design.visual`, `diagram.svg`, `diagram.tikz`, `slides.generate`, and `slides.modify` use `designer` for a complete design or revision checkpoint, `task` for rendering and optional imagegen, and `visioner` for a fresh current-revision render check. Main authorizes external-effect decisions during setup and accepts final delivery, but does not mediate the visual loop. Each selected workflow still supplies its own medium-specific spec, renderer, evidence, and acceptance criteria; this pattern does not collapse those workflows into TikZ.

If designer is unavailable, the affected TODO and final evidence preserve the precise unfulfilled checkpoint and permitted Agent-availability fallback; Main does not silently relabel its own work as designer evidence. If visioner is unavailable, record missing independent current-revision visual evidence. Compile, source, and static checks, designer self-review, and Main self-review do not replace that evidence. These are explicit evidence gaps rather than host enforcement: no dispatch, fixed fanout, routing, retry, permission, or completion decision is created by the Skill or workflow card.

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

- Catalog: stable ranking, bounded results, exact source/metadata/preview paths, edit-contract preservation, and pinned hash parity.
- Semantic method: Skill tests cover stable IDs, dangling-edge and decision-label checks, reachability, fixed pdfLaTeX compatibility, and asset rules; runtime tests cover only the source and filesystem boundaries the tools actually enforce.
- Paths and TeX: traversal, symlink escape, absolute includes, remote URLs, `\\write18`, pipe input, timeout, output cap, and no shell invocation.
- Assets: PNG/JPEG/WebP fixtures, decoded-format mismatch, image limits, deterministic PNG/hash naming, metadata removal, manifest merge, acceptance of imagegen-style temporary inputs, and publication only to a project-local final path.
- Tools: exact names, approval classes, `defaultInactive`, normalized parameters, structured details, and advisory findings.
- Workflow: `diagram.tikz` trigger and composition boundaries, one Skill, designer/visioner delegation, optional imagegen, current-revision render evidence, and no gate/router language.
- Inventory: workspace, lockfile, marketplace order, global Skill uniqueness, pack contents, and scoped version changes.
- E2E evidence parsing: linked `skill://.../references/...` reads remain method-resource evidence and are not misclassified as separate Skill identities.

## End-to-end tests

1. Copy and modify the pinned OpenTikZ flowchart template; compile PDF and render SVG/full/60% PNG evidence.
2. Produce a pure-vector flowchart when imagegen is unavailable.
3. Feed a mocked imagegen WebP/PNG result through asset preparation; verify project-local hash path, manifest, `graphicx` inclusion, compilation, and self-contained delivery.
4. Reject a malicious or escaping TikZ fixture without launching the compiler.
5. Verify `visioner` reviews the latest revision and a supported finding produces only a bounded fresh revision/review.
6. Install the worktree marketplace, confirm `tikz-diagram` discovery, confirm `tikz_*` tools are inactive by default, activate only `tikz`, and verify cache-backed Skill symlinks.
7. Run a live DeepSeek workflow canary for PLAN/READY, one Skill load, subagent dispatch when available, complete terminal delivery, and parent verification. Treat model behavior as a sample, not a deterministic release guarantee.
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
