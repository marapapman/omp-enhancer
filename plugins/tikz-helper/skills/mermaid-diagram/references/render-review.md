# Render and review method

Review a fresh, revision-bound render; source inspection alone is not visual evidence.

## Produce evidence

1. Confirm the Mermaid source uses only local Mermaid features (no external `img:` URLs, icon packs, or webfonts) and has no shell escape or remote resource.
2. Have `task` run `mermaid_render` when exposed and authorized. It renders offline in an isolated temporary workspace with a deterministic pinned configuration (`htmlLabels: false`, pinned `fontFamily`) and returns the source revision plus the revision-bound SVG and bounded command evidence.
3. Treat a missing engine, package, converter, or artifact as a visible limitation. Do not substitute an older render or claim success from a source-only check.
4. `task` binds the rendered SVG to the exact current source revision and semantic graph before requesting independent review.

## Review checkpoints

Check semantic fidelity first: all nodes, edges, arrow directions, decision branches, conditions, labels, loops, groups, and requested emphasis. Then check clipping, overlaps, text legibility, icon-label separation, spacing, crossings, color/contrast, and readability of the rendered SVG. Confirm the SVG is a real render: a `viewBox`, actual `<text>` elements for labels (no `foreignObject`), and no hand-edited coordinates.

`designer` owns each complete bounded Mermaid source revision. `task` invokes `mermaid_render` and binds fresh revision-bound SVG to that exact revision. `visioner` is a soft read-only review candidate and receives only the latest fresh SVG plus the semantic acceptance list.

For supported findings, `designer` returns one bounded source revision, `task` rerenders it, and `visioner` reviews only fresh rerendered evidence, at most once for that changed revision. Do not review an unchanged artifact again and do not create an automatic retry loop. Main only authorizes external effects during initial setup and accepts final delivery; it does not render, modify, reconcile, or mediate the visual loop. No reviewer verdict is a gate, permission to publish, or authority to declare completion; unresolved limitations remain visible.
Fix overlap, clipping, or crossings by revising the Mermaid source (labels, subgraphs, direction, `classDef` styles) and rerendering, never by editing SVG coordinates. A geometry finding returns the author to the Mermaid source; `task` rerenders, and the review judges only the fresh rerendered evidence.
When a `theme` or `width` was used, compare the rendered result against the requested size and legibility. Density or font-size findings are advisory — report them to Main, never fix by editing coordinates.
