# Semantic flowchart method

Make meaning explicit before choosing shapes or coordinates.

## Define the graph

Record one row per node with a stable semantic ID, role, exact label, incoming edges, outgoing edges, group, and optional icon. Record every edge separately with source, target, direction, condition, and label. Identify start and terminal states, decision nodes, loops, failure paths, and cross-group boundaries.

Resolve graph-level ambiguity before layout. Every decision must have all meaningful outgoing branches and visible branch labels. Every loop must show its return target. Avoid decorative arrows that have no recorded edge, and avoid orphaned nodes. Keep the user's terminology verbatim where precision matters.

## Map meaning to TikZ

1. Choose the smallest matching catalog base. Start with `flowchart` for decisions and loops, `system-block-diagram` for component/data-flow architecture, or another catalog item only when its semantics fit better.
2. Preserve the selected `edit_contract`, stable node naming, standalone document class, declared libraries, and parameter block. If the template fixes node IDs, keep them and record their semantic mapping; add new semantic names rather than coordinate-derived IDs.
3. Map roles consistently: terminals to start/end forms, operations to process forms, decisions to diamond forms, stores to datastore forms, and groups to background boundaries.
4. Lay out the main reading path first. Use aligned rows or columns, consistent spacing, and orthogonal routing where practical. Route exception and loop edges after the main spine; minimize crossings and keep arrowheads and labels clear of nodes.
5. Size nodes for their exact labels with padding. Separate an icon from its label into distinct placements; do not overlay art on text. Prefer vector icons already in the OpenTikZ catalog.
6. Compare the finished source back to the semantic graph. Check every node, edge, branch condition, label, direction, group, and requested emphasis before visual review.

Generated artwork cannot own or revise topology, edges, arrows, conditions, labels, or text. If an icon is unavailable, use a simple TikZ/vector symbol or a text-only node before considering raster generation.
