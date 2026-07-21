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

## Create or revise a figure

1. Capture the requested audience, output path, format, size, labels, topology, preservation constraints, and acceptance evidence. Ask only when an ambiguity changes the graph or meaning; state reversible visual defaults.
2. Write the semantic graph before geometry: stable node IDs, roles, exact labels, directed edges, branch conditions, start/end nodes, groups, direction, and icon needs. The graph owns meaning; decoration never changes it.
3. Search the bundled catalog with `tikz_catalog_search` when exposed. Read the selected metadata and its `edit_contract`. If catalog search is unavailable, use a code-native or plain TikZ fallback instead of guessing a packaged item. Prefer an existing vector icon, template, or example over generated artwork.
4. Treat the packaged OpenTikZ vendor snapshot as read-only. Copy the selected tool-returned `sourcePath` and required local assets into the user-authorized project path before editing; never infer a filename from a catalog directory and never edit the vendor tree.
5. Edit only the project copy. Preserve standalone compilation, declared packages, contract invariants, branch labels, and parametric controls. When an edit contract fixes template node IDs, retain them as source IDs and record their business meaning in the semantic spec; do not swap node roles merely to fit a name. Keep icon and label layout separate and legible.
6. Use OMP's native imagegen capability, currently exposed as `generate_image`, only under the optional method below. Main chooses whether to invoke it and owns the resulting asset integration.
7. Render the project source with `tikz_render` when exposed and authorized. Review the latest source plus revision-bound PDF, SVG, full-size PNG, and reduced PNG evidence; do not infer visual quality from source alone.
8. Deliver editable TikZ source, requested rendered artifacts, assumptions, provenance, validation evidence, and unresolved limitations. Do not publish or perform another external effect without host authorization.

## Delegate softly

`designer` is a soft delegation candidate for one complete, bounded source-design or revision checkpoint when that Agent is visible, input is complete, and delegation is safe. `visioner` is a soft read-only candidate for inspecting fresh rendered artifacts. Use only native Available Agents already visible; never probe or guess an Agent URI or inventory. Main chooses whether and when to delegate, retains the semantic graph, project integration, permissions, finding disposition, verification, and final response. No review is a gate or completion permission, and no automatic repair loop or fixed fanout follows from this Skill.
