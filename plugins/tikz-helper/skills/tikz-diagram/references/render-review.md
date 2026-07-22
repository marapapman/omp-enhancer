# Render and review method

Review a fresh, revision-bound render; source inspection alone is not visual evidence.

## Produce evidence

1. Confirm the project copy uses only project-relative inputs and has no shell escape or remote resource.
2. Have `task` run `tikz_render` when exposed and authorized. It compiles in an isolated temporary workspace and returns the source revision plus PDF, SVG, full-size PNG, reduced PNG, and bounded command evidence.
3. Treat a missing engine, package, converter, or artifact as a visible limitation. Do not substitute an older render or claim success from a source-only check.
4. `task` binds the rendered artifacts to the exact current source revision and semantic graph before requesting independent review.

## Review checkpoints

Check semantic fidelity first: all nodes, edges, arrow directions, decision branches, conditions, labels, loops, groups, and requested emphasis. Then check clipping, overlaps, text legibility, icon-label separation, spacing, crossings, color/contrast, and readability at both full and reduced size.

`designer` owns each complete bounded project-source revision. `task` invokes `tikz_render` and binds fresh artifacts to that exact revision. `visioner` is a soft read-only review candidate and receives only the latest full-size and reduced raster paths plus the semantic acceptance list.

For supported findings, `designer` returns one bounded source revision, `task` rerenders it, and `visioner` reviews only fresh rerendered evidence, at most once for that changed revision. Do not review an unchanged artifact again and do not create an automatic retry loop. Main only authorizes external effects during initial setup and accepts final delivery; it does not render, modify, reconcile, or mediate the visual loop. No reviewer verdict is a gate, permission to publish, or authority to declare completion; unresolved limitations remain visible.
