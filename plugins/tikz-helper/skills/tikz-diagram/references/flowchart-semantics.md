# Semantic flowchart method

Make meaning explicit before choosing shapes or coordinates.

## Define the graph

Record one row per node with a stable semantic ID, role, exact label, incoming edges, outgoing edges, group, and optional icon. Record every edge separately with source, target, direction, condition, and label. Identify start and terminal states, decision nodes, loops, failure paths, and cross-group boundaries.

Resolve graph-level ambiguity before layout. Every decision must have all meaningful outgoing branches and visible branch labels. Every loop must show its return target. Avoid decorative arrows that have no recorded edge, and avoid orphaned nodes. Keep the user's terminology verbatim where precision matters.

## Map meaning to ELK IR

The ELK graph IR is the sole source of node positions and edge geometry. The author never authors, infers, or hand-edits TikZ coordinates. Input nodes must omit x and y and input edges must omit sections and bendPoints; the layout engine computes them. Place elk.algorithm and every authored layout option in the graph-level layoutOptions; the separate tool layoutOptions parameter is not the reliable algorithm channel.

1. Encode nodes: stable id, `width`/`height` sized for the exact label plus padding, and `properties.shape` by role — terminals to `terminal`, operations to `rectangle` or `rounded`, decisions to `diamond`, stores to `cylinder` or `parallelogram`, groups to a parent node with `children`. Put every authored option, including `elk.algorithm`, in the graph-level `layoutOptions`.
2. Encode edges: single `sources`/`targets` per edge, `properties.arrow` from `->`, `<-`, `<->`, or `-` for none, and `properties.label` for branch conditions. Use `dashed` or `dotted` for the line style.
3. Choose `elk.algorithm`: `layered` for flows, pipelines, and architecture (default), `mrtree` for trees, `radial` for hub or mind-map layouts, `stress` or `force` for general association. Never recommend the fixed or random algorithms for a coordinate-free figure. Set `elk.direction: RIGHT|DOWN`. For compactness, rely on ELK's post-compaction (EDGE_LENGTH strategy, already default) and spacing parameters rather than switching algorithms. BRANDES_KOEPF is already the default node placement strategy.
4. Set generous spacing and edge routing: `elk.spacing.nodeNode` and `elk.spacing.edgeNode` for every algorithm; layered adds `elk.layered.spacing.nodeNodeBetweenLayers` and `elk.layered.spacing.edgeNodeBetweenLayers`. `elk.edgeRouting: ORTHOGONAL` is a layered choice; stress/force use POLYLINE or SPLINES. Do not promise ORTHOGONAL universally.
5. Groups: model a group as a parent node with `children`; for cross-parent edges require `layered` with `elk.hierarchyHandling: INCLUDE_CHILDREN`, since mixed algorithms do not support cross-parent edges.
6. Size each node to fit its exact label plus padding before calling the layout engine. The backend emits ELK-computed node dimensions as TikZ minimum width and height, with 2pt inner padding. Declare width and height sized for the exact label plus padding; ELK may enlarge nodes when its label measurement exceeds declared dimensions. Verify with a render. The backend emits minimum width/height from ELK-computed dimensions. Inner padding is 2pt. Edge labels render 1pt smaller than node labels. Separate an icon from its label into distinct placements; do not overlay art on text. Prefer vector icons already in the OpenTikZ catalog.
7. Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates. Compare the regenerated source back to the semantic graph: check every node, edge, branch condition, label, direction, group, and requested emphasis before visual review.

Generated artwork cannot own or revise topology, edges, arrows, conditions, labels, or text. If an icon is unavailable, use a simple TikZ/vector symbol or a text-only node before considering raster generation.

### Preset selection

Choose the `tikz_generate_diagram` preset parameter by target medium: `paper-column` (DOWN flow, compact spacing) for double-column paper figures; `paper-full` (RIGHT, medium spacing) for single-column or full-width figures; `slide-16-9` or `slide-4-3` (RIGHT, airy spacing) for slide decks. `elk.aspectRatio` in the slide presets is advisory under layered layout — for strict slide aspect ratio, select the stress algorithm in the graph-level layoutOptions.
