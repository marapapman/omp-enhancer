# Render and check method

Check a fresh, revision-bound render; source inspection alone is not visual evidence.

## Produce evidence

1. Confirm the Mermaid source uses only local Mermaid features (no external `img:` URLs, icon packs, or webfonts) and has no shell escape or remote resource.
2. Run `mermaid_render` when exposed and authorized. It renders offline in an isolated temporary workspace with a deterministic pinned configuration (`htmlLabels: false`, pinned `fontFamily`) and returns the source revision plus the revision-bound SVG and bounded command evidence.
3. Treat a missing engine, package, converter, or artifact as a visible limitation. Do not substitute an older render or claim success from a source-only check.
4. Bind the rendered SVG to the exact current source revision and semantic graph before the final check.

## Simple check by Main

Main performs the simple final check of the rendered SVG: confirm it is a real render with a `viewBox` and actual `<text>` elements for labels (no `foreignObject`), no clipping, no node overlap, branch labels legible, arrow directions correct, and the requested labels and topology present. Source, static, or author self-review does not replace a look at the fresh render; Main never claims visual acceptance from source alone.

For a supported finding, `designer` returns one bounded source revision, the source is rerendered, and Main checks only the fresh rerendered evidence, at most once for that changed revision. Do not review an unchanged artifact again and do not create an automatic retry loop. Main only authorizes external effects during initial setup and accepts final delivery; it does not render, modify, reconcile, or mediate the design. No check is a gate, permission to publish, or authority to declare completion; unresolved limitations remain visible.
Fix overlap, clipping, or crossings by revising the Mermaid source (labels, subgraphs, direction, `classDef` styles) and rerendering, never by editing SVG coordinates. A geometry finding returns the author to the Mermaid source; rerender, and the check judges only the fresh rerendered evidence.
When a `theme` or `width` was used, compare the rendered result against the requested size and legibility. Density or font-size findings are advisory — report them to Main, never fix by editing coordinates.
