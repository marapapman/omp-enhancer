# Draw.io Diagram Pipeline (drawio@365-skills)

Contract for the draw.io diagram pipeline: all figures are drawn with `drawio-skill` (the `drawio` plugin of the `365-skills` marketplace, plugin ID `drawio@365-skills`). `designer` draws the figure once and exports a draft PNG; `visioner` reviews that exported PNG read-only in one pass, checking edges pressed onto each other (压线) and edges crossing through boxes (穿框); `designer` applies at most one fix round; Main retains setup authorization and final acceptance only. There is no repeated iteration. This is the default and only pipeline for architecture, block-diagram, flowchart, decision-flow, and deploy-pipeline figures.

## Pipeline

1. Main fixes audience, target path (`.drawio`), export format, node set, labels, and evidence requirements.
2. `designer` draws once following `drawio-skill`: author the `.drawio` source, then export a draft PNG per the skill's export rules (preview export without `-e`, width capped with `--width 2000`).
3. `visioner` reviews that exported PNG read-only in one pass: edges pressed onto each other or onto boxes, edges crossing through boxes, clipped labels, overlapping shapes. visioner does not edit the XML and returns APPROVED | CHANGES_REQUIRED | UNREVIEWABLE.
4. Supported findings get exactly one fix round by `designer` on the `.drawio` source, then a re-export; remaining findings are reported as limitations instead of triggering another round.
5. Final export follows the skill's rules (embedded XML with `-e`, PNG repair afterwards); deliver the `.drawio` source plus the exported image. Main retains setup authorization and final acceptance only.

## Boundaries

- The skill's internal self-check and scripts (e.g. `validate.py`) belong to the drawing step; the cross-agent QA is exactly one visioner pass plus one fix round.
- The draw.io desktop CLI requirement comes from the skill; when it is unavailable, follow the skill's fallback (browser URL or XML-only delivery).
- This is advisory guidance, not a hard gate, router, fixed fanout, automatic loop, or completion authority.

## Retired pipelines

The in-repo `drawio-diagram` skill, its bundled `check-drawio-layout.mjs` geometry checker, and the drawio MCP route (`create_diagram` / `open_drawio_xml`) are retired. The Mermaid (`mermaid_render`) and SVG (`svg-flowchart`) pipelines were retired earlier.
