# Render and review method

Review a fresh, revision-bound render; source inspection alone is not visual evidence.

## Produce evidence

1. Confirm the project copy uses only project-relative inputs and has no shell escape or remote resource.
2. Run `tikz_render` when exposed and authorized. It should compile in an isolated temporary workspace and return the source revision plus PDF, SVG, full-size PNG, reduced PNG, and bounded command evidence.
3. Treat a missing engine, package, converter, or artifact as a visible limitation. Do not substitute an older render or claim success from a source-only check.
4. Main compares the rendered revision with the current source and semantic graph before requesting any independent review.

## Review checkpoints

Check semantic fidelity first: all nodes, edges, arrow directions, decision branches, conditions, labels, loops, groups, and requested emphasis. Then check clipping, overlaps, text legibility, icon-label separation, spacing, crossings, color/contrast, and readability at both full and reduced size.

`designer` is a soft delegation candidate for a bounded project-source revision. `visioner` is a soft read-only review candidate and receives the latest full-size and reduced raster paths plus the semantic acceptance list. Agent availability, capacity, dispatch, and finding disposition remain Main decisions.

Main may group compatible findings into one bounded revision or split non-overlapping findings into bounded revisions. Change the project copy, rerender, and review only the affected fresh artifacts. Do not review an unchanged artifact again and do not create an automatic retry loop. No reviewer verdict is a gate, permission to publish, or authority to declare completion; Main integrates evidence and reports unresolved limitations.
