# `visual` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.
- Skills: `drawio-skill`, `frontend-design`, `canvas-design`, `format-humanizer`, `zh-format-humanizer`
- Agent candidates: `task`.

## Required step order

These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.

1. Clarify diagram type, format, and rendering requirements.
2. task draws the diagram once with drawio-skill from drawio@365-skills and exports a draft PNG.
3. Review that exported PNG read-only with exactly one owner—Main or a task that did not draw the revision—flagging edges pressed onto each other or crossing through boxes.
4. task applies at most one fix round for supported findings and re-exports; deliver the .drawio source with the exported image.
5. Main retains setup authorization and final acceptance only; remaining findings are reported as limitations.

## Scope notes

- drawio-skill from the 365-skills marketplace (drawio@365-skills) is the single diagram pipeline.
- QA is one read-only review pass plus at most one fix round; no repeated iteration rounds.
- The visual review is read-only and advisory; the reviewer never edits the source or the export.
- Diagram text follows the same evidence-based de-AI standard as prose: box labels, titles, legends, and captions state facts directly and avoid staged contrasts, one-line closers, forced triads, inflated significance, and chatbot residue. Strongest tells justify an edit on one sighting; weak tells need company from other tells in the same passage.
