# `visual` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.
- Skills: `drawio-skill`, `frontend-design`, `canvas-design`
- Agent candidates: `designer`, `visioner`.

## Required step order

These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.

1. Clarify diagram type, format, and rendering requirements.
2. designer draws the diagram once with drawio-skill from drawio@365-skills and exports a draft PNG.
3. visioner reviews that exported PNG read-only in one pass, flagging edges pressed onto each other or crossing through boxes.
4. designer applies at most one fix round for supported findings and re-exports; deliver the .drawio source with the exported image.
5. Main retains setup authorization and final acceptance only; remaining findings are reported as limitations.

## Scope notes

- drawio-skill from the 365-skills marketplace (drawio@365-skills) is the single diagram pipeline.
- QA is one visioner pass plus at most one fix round; no repeated iteration rounds.
