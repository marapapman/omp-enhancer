# Mermaid authoring method

Make meaning explicit before choosing syntax or shapes.

## Define the graph

Record one row per node with a stable semantic ID, role, exact label, incoming edges, outgoing edges, group, and optional icon. Record every edge separately with source, target, direction, condition, and label. Identify start and terminal states, decision nodes, loops, failure paths, and cross-group boundaries.

Resolve graph-level ambiguity before authoring. Every decision must have all meaningful outgoing branches and visible branch labels. Every loop must show its return target. Avoid decorative arrows that have no recorded edge, and avoid orphaned nodes. Keep the user's terminology verbatim where precision matters.

## Map meaning to Mermaid syntax

The Mermaid source is the sole source of node positions and edge geometry. The author never authors, infers, or hand-edits SVG coordinates; `mermaid_render` computes the layout and emits the SVG.

1. Encode nodes: stable IDs (`id["exact label"]`) with a shape by role — default rectangles for operations, `(...)` rounded nodes for steps or terminals, `{...}` diamonds for decisions, `[[...]]` for subprocesses, `[/.../]` for inputs or outputs. Group related nodes in a `subgraph` with a stable ID and title; subgraphs may declare their own direction.
2. Encode edges: `-->` for directed flow, `-->|label|` or `-- label -->` for edge labels and branch conditions, `-.->` for dashed edges (rollback, alternative, failure paths), `o--o`, `<-->`, and `~~~` only when the meaning is recorded in the semantic graph. Never add an edge that has no semantic row.
3. Choose the diagram direction: `flowchart TD` for vertical column figures (double-column papers, pipelines) and `flowchart LR` for wide or landscape figures (full-width architecture, slide decks). State the direction explicitly at the diagram root; do not rely on the default.
4. Use `classDef` styles for emphasis — semantic roles, warning paths, or phase grouping — and `class` to bind nodes or subgraph members to a classDef. Keep style changes semantic; decoration never changes the graph.
5. Keep IDs stable across revisions. Review findings reference exact element IDs; renaming an ID between revisions breaks the mapping between findings, source, and render.
6. Keep top-level node counts readable: column figures read best with at most ~8 top-level nodes; otherwise split the graph, shorten labels, or widen the direction — never edit the rendered SVG.
7. Fix overlap, clipping, or crossings by revising the Mermaid source (labels, subgraphs, direction, `classDef` styles) and rerendering, never by editing coordinates. Compare the regenerated render back to the semantic graph: check every node, edge, branch condition, label, direction, group, and requested emphasis before visual review.

Generated artwork cannot own or revise topology, edges, arrows, conditions, labels, or text. If an icon is unavailable, use a simple Mermaid shape or a text-only node before considering raster generation. Icon assets, when requested, come from the `svg-flowchart` Skill as monochrome, orthogonal, checker-validated SVGs bound to their owning node ID.

## Determinism and render configuration

`mermaid_render` accepts `theme` (`default`, `forest`, `dark`, `neutral`) and `width`; pass them deliberately and keep them stable across revisions of the same figure. The renderer pins `htmlLabels: false` and a `fontFamily` so text metrics and layout stay reproducible, and runs fully offline: use only local Mermaid features — no external `img:` URLs, icon packs, or webfonts — so rendering makes zero network requests. The revision hash binds the exact source, config, and tool versions, so artifact identity is honest even if text metrics drift across machines or fonts.

Deliver the Mermaid source as the editable artifact and the revision-bound SVG as the rendered evidence; never hand-edit the SVG or treat the render as a hand-draft surface.
