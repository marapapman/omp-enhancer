---
name: tikz-diagram
description: Create, revise, render, and review editable TikZ figures and semantic flowcharts with the bundled OpenTikZ catalog. Use for LaTeX diagrams, architecture or pipeline figures, decision flows, reusable TikZ icons, and optional generated node artwork.
---

# TikZ Diagram

Build the figure from an explicit semantic graph, then select and copy a pinned OpenTikZ base, edit the project copy, render it, and review fresh artifacts. Keep OMP's native tools, permissions, current Agents, approvals, and completion behavior authoritative.

## Load the method

Read these directly linked resources once per top-level Main task when their stage applies. This is progressive method loading, not a gate or block; a delegated child receives the bounded method it needs in its assignment instead of treating the read count as shared completion state.

- Read `skill://tikz-diagram/references/opentikz-contract.md` before selecting or copying catalog content.
- Read `skill://tikz-diagram/references/flowchart-semantics.md` before drawing a flowchart, pipeline, architecture, or other connected-node figure.
- Read `skill://tikz-diagram/references/imagegen-assets.md` when custom node artwork is requested or a missing-icon generation-versus-fallback decision is needed, even if imagegen may be unavailable.
- Read `skill://tikz-diagram/references/render-review.md` before rendering and visual review.

After choosing only the applicable resources above, the next linked-resource response must start at byte 0 with this one visible handoff:

`RESOURCE EXTENSION | source=skill://tikz-diagram | reads=<applicable-exact-linked-URIs-in-listed-order>`

In that same response, read exactly the applicable exact URIs once in their listed order as one resource-only batch, then end and wait before THEN. Use at most one linked-method batch and never reread a linked URI. The marker appears before the resource reads; never emit it after those reads, and never emit it together with the final workflow reference or defer it to THEN. This is syntax and timing guidance only: it does not block, route, dispatch, retry, grant permission, or decide completion.

## Create or revise a figure

The ELK graph IR is the sole source of node positions and edge geometry. The author never authors, infers, or hand-edits TikZ coordinates. Author the semantic graph as an ELK IR and call tikz_generate_diagram to compute the layout with ELK.

1. Capture the requested audience, output path, format, size, labels, topology, preservation constraints, acceptance evidence, target-medium preset (paper-column, paper-full, slide-16-9, slide-4-3) and density preference. Ask only when an ambiguity changes the graph or meaning; state reversible visual defaults.
2. Write the semantic graph before geometry: stable node IDs, roles, exact labels, directed edges, branch conditions, start/end nodes, groups, direction, and icon needs. The graph owns meaning; decoration never changes it.
3. Author the semantic graph as an ELK graph IR: nodes sized for their exact labels plus padding, single source/target edges, and graph-level `layoutOptions` carrying `elk.algorithm` and `elk.direction`; spacing, padding, node sizing, and compaction are engine-managed defaults. Input nodes must omit x and y and input edges must omit sections and bendPoints; the layout engine computes them. Model groups as parent nodes with `children`; cross-parent edges need layered with `elk.hierarchyHandling: INCLUDE_CHILDREN`.
3b. Optionally use `tikz_catalog_search` for an icon or a semantic reference only — OpenTikZ geometry is never copied or used to infer coordinates. Prefer an existing vector icon over generated artwork; keep vendor files read-only, copy the returned `sourcePath` before editing, and never edit the vendor tree or infer a filename from a catalog directory.
3c. Before generating, confirm the ELK layout engine (`elkjs`) is installed. If `tikz_generate_diagram` reports `ELK_NOT_INSTALLED`, install it with `npm run install:deps` (or the `omp_core_install_deps` tool) and call `tikz_generate_diagram` again. Never fall back to hand-authored TikZ coordinates when ELK is missing; install ELK first and regenerate from the ELK graph IR.
4. Call `tikz_generate_diagram` to compute the layout with ELK and emit the compilable TikZ source. The tool returns the `.tex` source and positioned graph metadata; it is the sole geometry source, not a hand-draft surface.
5. Write the returned `.tex` to the user-authorized project path. The engine applies tuned spacing, padding, and compaction defaults; pass the chosen preset, density, and any explicit targetWidthPt to the tool. If overlap or clipping persists, adjust specific ELK layout options or node sizes and regenerate, never by editing coordinates. The author never authors, infers, or hand-edits TikZ coordinates. Treat imagegen, exposed as `generate_image`, as an optional icon source only under the method below; Main authorizes that optional external effect during initial setup and `task` invokes it.
5b. Optionally write the returned positioned ELK graph IR (the `ir` field, standard ELK JSON) to a project-local `<figure>.elk.json` for editing in an ELK-compatible visual editor; feed the edited IR back as the `graph` input to `tikz_generate_diagram` to regenerate the TikZ. Re-importing recomputes layout via ELK, so structural, label, and size edits survive while node positions are recomputed; the IR is a round-trip artifact, and visual editing does not make the model hand-author TikZ coordinates.
6. Have `task` render the project source with `tikz_render` when exposed and authorized, bind the exact source revision to the PDF, SVG, full-size PNG, and reduced PNG evidence, and pass only that fresh set to `visioner`; do not infer visual quality from source alone.
7. Deliver editable TikZ source, requested rendered artifacts, assumptions, provenance, validation evidence, and unresolved limitations. Do not publish or perform another external effect without host authorization.

## Media presets

| Preset | Physical target | Flow | Font | Spacing |
|--------|----------------|------|------|---------|
| paper-column | Double-column paper (≈240pt) | DOWN (vertical) | 9pt | Compact |
| paper-full | Full text width (≈504pt) | RIGHT (horizontal) | 10pt | Medium |
| slide-16-9 | Slide 16:9 (aspect ratio ≈1.78) | RIGHT | 14pt | Airy |
| slide-4-3  | Slide 4:3 (aspect ratio ≈1.33) | RIGHT | 14pt | Airy |

Column figures read best with at most ~8 top-level nodes. Slides prefer density=airy for readability. When sizing metadata warns that the effective font drops below 6pt, split the graph, shorten labels, or choose a wider preset — never edit coordinates.

## Plan icon assets and review previews before layout

Each node icon must have a plan before it enters the figure layout. `designer` owns one icon plan per node that needs an icon; the plan records the icon source (OpenTikZ vector icon, imagegen pictogram, or native TikZ/text fallback), the requested square size and internal padding, the owning node ID, and at least one alternative when the preferred source may be unavailable or illegible. A plan is not a generation request; it is a bounded, source-first decision recorded against the semantic figure spec.

Only `visioner`-approved icons enter the asset manifest. `task` prepares each planned asset through `tikz_prepare_asset`, then exposes the prepared assets as a preview set (for example via `tikz_preview_assets`) with each entry bound to its `nodeId`, size, padding, declared source, and fresh full-size and 60% raster previews. `visioner` reviews that preview set per asset and returns `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for each entry. A `CHANGES_REQUIRED` asset returns to `designer` for one bounded revision; `task` reprepares and re-previews only that asset, and `visioner` reviews only the fresh rerendered asset, at most once. An asset that remains `UNREVIEWABLE` or `CHANGES_REQUIRED` after one revision falls back to a native TikZ or text-backed node; it does not block the figure.

`tikz_generate_diagram` is called only after asset review. The author feeds the semantic graph as an ELK graph IR and the `visioner`-approved asset manifest to `tikz_generate_diagram`, which computes the layout with ELK and emits the compilable TikZ source. The author never calls `tikz_generate_diagram` with unreviewed or unsubstituted icon assets, and never hand-edits the coordinates it returns.

SVG and other non-TikZ formats are only for icon assets, preview, or compatibility — not for replacing the TikZ main figure. An SVG icon asset is a node pictogram embedded in the TikZ figure; an SVG preview or export is compatibility or review evidence for the TikZ figure. Topology, labels, connectors, node positions, and edge geometry remain TikZ. The `svg-flowchart` Skill is an asset method under `diagram.tikz` that produces monochrome SVG icon assets; it does not author standalone diagrams or own figure layout.

## Compile the dependent Agent chain

For a selected non-simple `diagram.tikz` workflow, the compiled dependency chain has two stages that run in order: the **asset chain** runs before the **figure chain**. Use only native Available Agents already visible; never probe or guess an Agent URI or inventory.

**Asset chain (before layout):**

1. **Designer blueprint checkpoint** — `designer` owns one icon plan per node that needs an icon: source (OpenTikZ vector icon, imagegen pictogram, or native TikZ/text fallback), requested square size and padding, owning node ID, and at least one alternative. It returns the bounded icon plan set and the semantic figure spec; a partial plan is not a completed delivery.
2. **Task asset checkpoint** — `task` prepares each planned asset through `tikz_prepare_asset` and exposes a preview set (e.g. `tikz_preview_assets`) with each entry bound to its `nodeId`, size, padding, declared source, and fresh full-size and 60% raster previews.
3. **Visioner asset-review checkpoint** — `visioner` independently and read-only reviews the preview set per asset, returning `APPROVED | CHANGES_REQUIRED | UNREVIEWABLE` for each entry. Only `visioner`-approved assets enter the manifest; a `CHANGES_REQUIRED` asset returns to `designer` for one bounded revision and `visioner` reviews only the fresh rerendered asset, at most once.

**Figure chain (after asset review):**

4. **Designer layout checkpoint** — Only after asset review, `designer` feeds the semantic graph as an ELK graph IR and the `visioner`-approved asset manifest to `tikz_generate_diagram`, which computes the layout with ELK and emits the standalone TikZ source. The author never calls `tikz_generate_diagram` with unreviewed or unsubstituted icon assets, and never hand-edits the coordinates it returns.
5. **Task render checkpoint** — After `designer` returns the complete manifest-bound source revision, `task` invokes `tikz_render`: it validates project-relative paths, copies the dependency graph to a temporary workspace, and binds fresh exact revision PDF, SVG, full-size PNG, and 60% PNG plus structured command evidence.
6. **Visioner figure-review checkpoint** — Only after the designer delivery is integrated and task renders exist, `visioner` independently and read-only checks layout and legibility on the fresh current-revision full-size and 60% renders against the semantic spec and asset manifest.
7. **Designer-visioner loop** — `designer` applies supported findings, `task` rerenders, and `visioner` reviews only fresh rerenders at most once per changed revision. Main authorizes external-effect decisions during initial setup and accepts the final delivery; it does not render, modify, reconcile, or mediate the visual loop.

If `designer` is unavailable, the affected TODO and final evidence record the precise unfulfilled designer checkpoint and the permitted Agent-availability fallback. Main cannot claim designer evidence by silently substituting itself. If `visioner` is unavailable, record missing independent current-revision visual evidence. Compile, source, and static checks, designer self-review, or Main self-review do not replace it.

This chain is Agent-owned planning guidance, not host enforcement: it neither dispatches, fixes fanout, gates, routes, retries, grants permission, nor decides completion. No review is a gate or completion permission, and no automatic repair loop follows from this Skill.
