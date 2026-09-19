---
name: canvas-design
description: Create static visual artifacts with task-owned revisions, current export evidence, and a single read-only visual review.
---

# Canvas design

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Use this when the user asks for a poster, static visual artifact, or exportable visual layout.

## Coordinate design and current-export review

For every static visual design or revision, use a currently exposed `task` for the complete design, source revision, integration, and export/render checkpoint, and a separate read-only visual review owner selected by Main when each assignment is safe and complete.

1. `task` owns the complete design, source revision, integration, and export/render checkpoint. Supply the artifact brief, intended dimensions, audience, message, existing visual system, output constraints, and preservation requirements. Reconcile the revision against that scope, bind one revision identifier through the source, exports/screenshots, and review request, and never mix stale or mixed-revision evidence.
2. The single read-only visual review uses exactly one owner—Main, or a task that did not produce the revision. That owner examines only the current-revision evidence, read-only, for hierarchy, composition, alignment, spacing, typography, clipping, contrast, image treatment, and export fidelity. Source checks, static checks, and self-review by the producing agent are not independent visual evidence.
3. For a supported visual finding, `task` applies the bounded source revision, re-exports/rerenders and binds fresh evidence, and the review owner examines only the fresh export, at most once for that changed revision. Do not review an unchanged artifact.

Main only authorizes external effects during initial setup and accepts final delivery; it does not render, export, modify, reconcile, or mediate the visual loop. If no read-only visual reviewer is available, record the missing independent current-revision visual evidence. Findings remain advisory. This evidence chain does not route, block, select a fanout, launch automatic repairs, or decide completion.

1. Define the artifact size, audience, message, and visual hierarchy.
2. Use original composition, color, typography, and spacing.
3. Keep text short, legible, and correctly spelled.
4. Commit to one deliberate aesthetic direction and establish a clear focal point, reading order, spacing rhythm, and contrast structure before adding decoration.
5. Avoid generic AI composition such as interchangeable card grids, gratuitous glow or glass effects, gradient text, repetitive icon-and-heading blocks, or a uniformly centered layout unless the brief specifically calls for them.
6. Validate the final exported artifact at its intended size rather than only the source code. Check clipping, text legibility, alignment, image treatment, color contrast, and whether the hierarchy survives export.
7. Apply the same evidence-based de-AI standard to artifact text. Headlines, captions, labels, and body copy avoid staged run-up, one-line closers, forced triads, inflated significance, dashes used as a universal connector, bold as decoration, and chatbot residue. A strong tell justifies a revision on one sighting; a weak tell needs company from other tells in the same passage. Hard bans, fixed whenever found rather than clustering-gated: no "不是X，而是Y" contrast-repetition construction or its English equivalents ("not X, but Y"); no opening or closing one-sentence summary that restates what the artifact shows; and no "XX：XX" label+colon+label headlines. Leave wording alone inside quotations, titles, and proper names, and keep the specific details that carry the writer's voice. The standard is advisory method guidance inside this Skill; it adds no runtime gate or automatic check, and it never justifies dropping a fact, number, or citation.
