---
name: canvas-design
description: Create static visual artifacts with designer-owned revisions, current export evidence, and independent visioner visual QA.
---

# Canvas design

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Use this when the user asks for a poster, static visual artifact, or exportable visual layout.

## Coordinate design and current-export review

For every static visual design or revision, use a currently exposed `designer`
for the design checkpoint and a currently exposed `visioner` for the later
independent review when each assignment is safe and complete.

1. `designer` owns the design and revision checkpoint. Supply the artifact brief, intended dimensions, audience, message, existing visual system, output constraints, and preservation requirements. The designer returns a bounded design revision, not completion permission.
2. Main reconciles and integrates that revision within the authorized scope. Main binds one revision identifier to the source and its exact current revision, then produces a fresh intended-size export plus a useful reduced preview when relevant. Carry that one revision identifier through the source, exports, preview, and review request; never mix pre-designer, stale, or differently identified evidence.
3. `visioner` independently reviews only that current-revision evidence, read-only, for hierarchy, composition, alignment, spacing, typography, clipping, contrast, image treatment, and export fidelity. Main review, source checks, static checks, and designer self-review do not count as independent visioner evidence.

If `designer` is unavailable, record the specific unfulfilled design checkpoint and the Agent fallback reason. If `visioner` is unavailable, record the missing independent current-revision visual evidence. Findings remain advisory for Main to disposition. This evidence chain does not route, block, select a fanout, launch repairs, or decide completion.

1. Define the artifact size, audience, message, and visual hierarchy.
2. Use original composition, color, typography, and spacing.
3. Keep text short, legible, and correctly spelled.
4. Commit to one deliberate aesthetic direction and establish a clear focal point, reading order, spacing rhythm, and contrast structure before adding decoration.
5. Avoid generic AI composition such as interchangeable card grids, gratuitous glow or glass effects, gradient text, repetitive icon-and-heading blocks, or a uniformly centered layout unless the brief specifically calls for them.
6. Validate the final exported artifact at its intended size rather than only the source code. Check clipping, text legibility, alignment, image treatment, color contrast, and whether the hierarchy survives export.
