# draw.io geometry review

Before delivery, verify the authored XML mechanically, then confirm the rendering evidence. The rules below map one-to-one to the layout contract: no overlapping boxes, no line crossing a box, no line-on-line overlap, arrows perpendicular to box edges, arrowheads perpendicular to the line, fonts sized for PPT or print, text not on lines, text not out of boxes.

## 1. Static checker (always run)

```bash
node <skill-directory>/scripts/check-drawio-layout.mjs path/to/figure.drawio
```

The checker parses the `<mxGraphModel>` and reports, per finding, the severity and the offending cell IDs:

- **ERROR — box overlap**: two vertex rectangles intersect with positive area.
- **ERROR — font size**: a text vertex declares `fontSize` below 14 (or relies on the default 12).
- **ERROR — text overflow estimate**: the label (chars × fontSize × 0.62, lines × fontSize × 1.4) does not fit the box with padding. Fix by shortening the label or enlarging the box — never by shrinking the font.
- **ERROR — attachment not perpendicular**: an edge's `exitX/exitY` or `entryX/entryY` is not a fixed side midpoint (one coordinate 0/1, the other 0.5).
- **ERROR — edge crosses a box**: an edge segment (from explicit waypoints, or from the default orthogonal path) passes through the interior of a third box.
- **ERROR — edge on box border**: an edge segment lies exactly on a box border.
- **ERROR — edge overlaps edge**: two edge segments are collinear and overlap.
- **WARNING — tight gutter**: two boxes are closer than 24 px (they do not overlap).
- **WARNING — parallel edges too close**: parallel segments are less than 12 px apart.
- **WARNING — arrowhead**: an edge lacks `endArrow=classic`+`endFill=1` or has `endSize < 8`.

The checker is deterministic and advisory: fix every ERROR before calling the drawio MCP; treat WARNINGs as review items. The checker validates authored geometry — it cannot prove how the drawio client will reroute an edge it decides to move, so the render evidence in step 2 remains the final check.

## 2. Render evidence (how far each piece of evidence goes)

| Evidence | Proves |
|---|---|
| `create_diagram` response (hosted server, terminal host) | the server accepted the XML (syntax/parse validation). It is an echo, **not** a layout verdict. |
| `create_diagram` with `postLayout: "elk"` in an MCP Apps host | the rendered viewer applied ELK layered layout; in an Apps host the inline diagram is real render evidence. |
| `open_drawio_xml` with `routing: "libavoid"` (local tool server) | the local server reroutes connectors around shapes before opening; the diagram opened in the draw.io editor is real render evidence. |
| Opening the `.drawio` file in the draw.io editor | the authoritative visual check: overlaps, crossings, perpendicularity, font legibility, text fit. |

In a terminal host, do not claim "no crossing" from the tool response alone — state that the geometry checker passed, the server accepted the XML, and the `.drawio` file is ready for the editor QA.

## 3. Human-eye checklist for the editor QA

1. No two boxes overlap; boxes keep a visible gutter.
2. No connector passes through a box; connectors never run along a box border.
3. Every connector is orthogonal (only horizontal/vertical segments); arrows touch box edges at right angles.
4. Arrowheads are solid triangles; the triangle base is perpendicular to the connector line.
5. All text is at least 14 pt equivalent and readable at print/PPT scale.
6. No text sits on a connector line; edge labels, where present, have a background.
7. No text overflows its box (no clipped or spilling labels).
8. Zoomed-out, the diagram reads as a clean layered structure with clear flow direction.

## 4. Fix loop

Any failing check is fixed in the XML (move boxes, enlarge boxes, add waypoints, shorten labels, raise font size), never by hand-editing a rendered artifact. Re-run the checker after each fix round; only then call the drawio MCP again.
