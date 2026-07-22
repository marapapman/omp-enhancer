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

1. Capture the requested audience, output path, format, size, labels, topology, preservation constraints, and acceptance evidence. Ask only when an ambiguity changes the graph or meaning; state reversible visual defaults.
2. Write the semantic graph before geometry: stable node IDs, roles, exact labels, directed edges, branch conditions, start/end nodes, groups, direction, and icon needs. The graph owns meaning; decoration never changes it.
3. Search the bundled catalog with `tikz_catalog_search` when exposed. Read the selected metadata and its `edit_contract`. If catalog search is unavailable, use a code-native or plain TikZ fallback instead of guessing a packaged item. Prefer an existing vector icon, template, or example over generated artwork.
4. Treat the packaged OpenTikZ vendor snapshot as read-only. Copy the selected tool-returned `sourcePath` and required local assets into the user-authorized project path before editing; never infer a filename from a catalog directory and never edit the vendor tree.
5. Edit only the project copy. Preserve standalone compilation, declared packages, contract invariants, branch labels, and parametric controls. When an edit contract fixes template node IDs, retain them as source IDs and record their business meaning in the semantic spec; do not swap node roles merely to fit a name. Keep icon and label layout separate and legible.
6. Use OMP's native imagegen capability, currently exposed as `generate_image`, only under the optional method below. Main authorizes that optional external effect during initial setup; `task` invokes it and prepares its output, while `designer` owns manifest-listed asset integration into the complete source revision.
7. Have `task` render the project source with `tikz_render` when exposed and authorized, bind the exact source revision to the PDF, SVG, full-size PNG, and reduced PNG evidence, and pass only that fresh set to `visioner`; do not infer visual quality from source alone.
8. Deliver editable TikZ source, requested rendered artifacts, assumptions, provenance, validation evidence, and unresolved limitations. Do not publish or perform another external effect without host authorization.

## Compile the dependent Agent chain

For a selected non-simple `diagram.tikz` workflow, the normal compiled dependency chain is `designer` -> `task` -> `visioner` when those matching Agents are exposed, assignment input is complete, and delegation is safe. Use only native Available Agents already visible; never probe or guess an Agent URI or inventory.

1. **Designer checkpoint** — `designer` owns one complete, bounded design and source revision checkpoint. It returns the editable project-owned TikZ source, semantic figure spec, asset manifest, preserved edit-contract facts, and dependency list; a partial sketch is not a completed delivery.
2. **Task render checkpoint** — Under Main's initial setup authorization, `task` invokes optional `generate_image` for a useful missing node icon, passes its output through `tikz_prepare_asset`, and integrates the normalized asset metadata into the manifest for designer-owned source integration. After `designer` returns the complete manifest-bound source revision, `task` invokes `tikz_render`: it validates project-relative paths, copies the dependency graph to a temporary workspace, and binds fresh exact revision PDF, SVG, full-size PNG, and 60% PNG plus structured command evidence.
3. **Visioner checkpoint** — Only after the designer delivery is integrated and task renders exist, `visioner` independently and read-only checks layout and legibility on the fresh current-revision full-size and 60% renders against the semantic spec and asset manifest.
4. **Designer-visioner loop** — `designer` applies supported findings, `task` rerenders, and `visioner` reviews only fresh rerenders at most once per changed revision. Main authorizes external-effect decisions during initial setup and accepts the final delivery; it does not render, modify, reconcile, or mediate the visual loop.

If `designer` is unavailable, the affected TODO and final evidence record the precise unfulfilled designer checkpoint and the permitted Agent-availability fallback. Main cannot claim designer evidence by silently substituting itself. If `visioner` is unavailable, record missing independent current-revision visual evidence. Compile, source, and static checks, designer self-review, or Main self-review do not replace it.

This chain is Agent-owned planning guidance, not host enforcement: it neither dispatches, fixes fanout, gates, routes, retries, grants permission, nor decides completion. No review is a gate or completion permission, and no automatic repair loop follows from this Skill.
