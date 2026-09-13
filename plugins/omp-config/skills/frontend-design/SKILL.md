---
name: frontend-design
description: Design or refine production web interfaces with task-owned revisions, current responsive render evidence, and a single read-only visual review.
---

# Frontend design

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Use this when the requested deliverable is visual UI design or UI polish.

## Coordinate design and current-render review

For every visual UI design or revision, use a currently exposed `task` for the complete design, source revision, integration, and export/render checkpoint, and a separate read-only visual review owner selected by Main when each assignment is safe and complete.

1. `task` owns the complete design, source revision, integration, and export/render checkpoint. Supply the product intent, existing visual system, requested scope, responsive targets, reachable interaction states, and preservation constraints. Reconcile the revision against that scope, bind one revision identifier through the source, exports/screenshots, state labels, and review request, and never mix stale or mixed-revision evidence.
2. The single read-only visual review uses exactly one owner—Main, or a task that did not produce the revision. That owner examines only the current-revision evidence, read-only, for hierarchy, alignment, spacing, typography, clipping, overflow, contrast, state clarity, and cross-viewport consistency. Source checks, static checks, and self-review by the producing agent are not independent visual evidence.
3. For a supported visual finding, `task` applies the bounded source revision, rerenders and binds fresh evidence, and the review owner examines only the fresh rerender, at most once for that changed revision. Do not review an unchanged artifact.

Main only authorizes external effects during initial setup and accepts final delivery; it does not render, modify, reconcile, or mediate the visual loop. If no read-only visual reviewer is available, record the missing independent current-revision visual evidence. Findings remain advisory. This evidence chain does not route, block, select a fanout, launch automatic repairs, or decide completion.

## Work from the product system

1. Start from the user's product intent and existing visual system. Inspect design tokens, theme files, shared primitives, and representative existing components before adding CSS or component variants.
2. Reuse the established color, spacing, typography, radius, shadow, motion, and component conventions. When the product has no coherent system, define only the minimum reusable tokens and shared primitives needed for the requested scope.
3. Compose existing primitives instead of introducing one-off containers, hard-coded colors, arbitrary spacing, or local overrides that cannot be explained by the system.
4. Choose a clear visual direction appropriate to the product rather than combining unrelated fashionable effects.

## Cover behavior and accessibility

- Implement loading, empty, error, disabled, hover, and focus states when the interaction can reach them.
- Preserve semantic markup, keyboard access, visible focus, readable contrast, and screen-reader labels.
- Verify responsive behavior at the widths relevant to the product. Check overflow, wrapping, content priority, touch targets, and whether controls remain understandable without hover.
- Review hierarchy, alignment, spacing rhythm, typography, color use, feedback, and consistency against surrounding screens.

## Avoid generic output

Do not use generic AI styling as a substitute for product decisions. Avoid decorative glass effects, cyan-purple gradients, gradient metric text, repeated identical card grids, cards nested inside cards, icon-above-heading repetition, center alignment everywhere, or oversized rounded elements unless the existing product system or user request calls for them. Do not flatten every action into the same primary emphasis or use modal dialogs where an inline state is clearer.

Apply the same evidence-based de-AI standard to interface copy. Titles, labels, button text, tooltips, empty states, error messages, and notifications avoid staged run-up, one-line closers, forced triads, inflated significance, borrowed authority, bold as decoration, and chatbot residue such as "Oops!" or "Something went wrong on our end." A strong tell justifies a revision on one sighting; a weak tell needs company from other tells in the same passage. Keep the product's real nouns, numbers, and error details; a friendlier invented claim is never a fix. The standard is advisory method guidance inside this Skill; it adds no runtime gate or automatic check.

Verify the implemented interface in its actual renderer and report concrete limitations. A source-only review is not visual evidence.
