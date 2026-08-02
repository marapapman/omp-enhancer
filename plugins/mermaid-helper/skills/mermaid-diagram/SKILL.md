---
name: mermaid-diagram
description: Author, render, and review editable Mermaid diagrams to revision-bound SVG via mermaid_render
---

# Mermaid Diagram

Build the figure from an explicit semantic graph, author it as Mermaid source in one pass, render it with `mermaid_render`, and have Main perform a simple check of the rendered SVG. Keep OMP's native tools, permissions, current Agents, approvals, and completion behavior authoritative.

## Load the method

Read these directly linked resources once per top-level Main task when their stage applies. This is progressive method loading, not a gate or block; a delegated child receives the bounded method it needs in its assignment instead of treating the read count as shared completion state.

- Read `skill://mermaid-diagram/references/mermaid-authoring.md` before authoring or revising Mermaid source.
- Read `skill://mermaid-diagram/references/render-review.md` before rendering and checking the rendered SVG.

After choosing only the applicable resources above, the next linked-resource response must start at byte 0 with this one visible handoff:

`RESOURCE EXTENSION | source=skill://mermaid-diagram | reads=<applicable-exact-linked-URIs-in-listed-order>`

In that same response, read exactly the applicable exact URIs once in their listed order as one resource-only batch, then end and wait before THEN. Use at most one linked-method batch and never reread a linked URI. The marker appears before the resource reads; never emit it after those reads, and never emit it together with the final workflow reference or defer it to THEN. This is syntax and timing guidance only: it does not block, route, dispatch, retry, grant permission, or decide completion.

## Create or revise a diagram

The Mermaid source is the sole source of node positions and edge geometry. The author never authors, infers, or hand-edits SVG coordinates. Author the semantic graph as Mermaid source and call `mermaid_render` to convert it to revision-bound SVG.
`mermaid_render` is a regular OMP tool — invoke it as a standard tool call (like `read`/`bash`/`edit`). In contrast, `generate_image` is an xd:// device invoked via `write` to `xd://generate_image`.

1. Capture the requested audience, output path, format, size, labels, topology, icon needs, preservation constraints, and acceptance evidence. Ask only when an ambiguity changes the graph or meaning; state reversible visual defaults.
2. Write the semantic graph before syntax: stable node IDs, roles, exact labels, directed edges, branch conditions, start/end nodes, subgraphs, and direction. The graph owns meaning; decoration never changes it.
3. Author the complete Mermaid source from the semantic graph in one pass: a `flowchart` diagram with `TD` or `LR` direction, node shapes by role (rectangles, rounded nodes, diamond decisions, subgraphs for groups), labeled directed edges with visible branch conditions, and `classDef` styles for emphasis. Keep IDs stable across revisions so findings map to exact elements.
4. Call `mermaid_render` with the authored Mermaid source (or its project path) and the chosen `theme` and `width`, and bind the exact source revision to the revision-bound SVG artifact. The tool renders offline with a deterministic pinned configuration (`htmlLabels: false`, pinned `fontFamily`); the SVG is fresh render evidence, not a hand-draft surface.
5. Write the Mermaid source to the user-authorized project path and keep the revision-bound SVG bound to that exact revision; never hand-edit SVG coordinates. If overlap, clipping, or branch-label legibility persists, revise the Mermaid source (labels, subgraphs, direction, `classDef` styles) and rerender, never by editing coordinates.

Deliver the Mermaid source, the revision-bound SVG, assumptions, validation evidence, and unresolved limitations. Do not publish or perform another external effect without host authorization.

## Keep the render deterministic and offline

`mermaid_render` renders with `htmlLabels: false` and a pinned `fontFamily` so text metrics and layout stay reproducible; the revision hash binds the exact source, config, and tool versions. Use only local Mermaid features — no external `img:` URLs, icon packs, or webfonts — so rendering makes zero network requests. Never hand-edit the rendered SVG; treat a geometry or legibility finding as a Mermaid source revision.

## Roles and authority

Use only native Available Agents already visible; never probe or guess an Agent URI or inventory. `designer` authors the complete Mermaid source in one pass and owns that single source revision. Rendering is a tool call on that exact source. Main performs a simple check of the rendered SVG — viewBox and real `<text>` labels (no `foreignObject`), no clipping, no overlap, branch labels legible, arrows in the right direction — and accepts or rejects delivery.

If `designer` is unavailable, the affected TODO and final evidence record the precise unfulfilled designer checkpoint and the permitted Agent-availability fallback. Main cannot claim designer evidence by silently substituting itself. Main only authorizes external effects during initial setup and accepts final delivery; it does not render, modify, reconcile, or mediate the design. No review is a gate or completion permission, and no automatic repair loop follows from this Skill.
