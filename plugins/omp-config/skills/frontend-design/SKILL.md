---
name: frontend-design
description: Design or refine production web interfaces with designer-owned revisions, current responsive render evidence, and independent visioner visual QA.
---

# Frontend design

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Use this when the requested deliverable is visual UI design or UI polish.

## Coordinate design and current-render review

For every visual UI design or revision, use a currently exposed `designer` for
the design checkpoint, `task` for integration and rendering, and a currently
exposed `visioner` for the later independent review when each assignment is
safe and complete.

1. `designer` owns the complete design and source revision checkpoint. Supply the product intent, existing visual system, requested scope, responsive targets, reachable interaction states, and preservation constraints. The designer reconciles its revision against that scope and returns a bounded complete design revision, not completion permission.
2. `task` owns integration and authorized execution. It integrates the exact designer revision without taking design ownership, runs it in the intended renderer, binds one revision identifier to the integrated UI and its exact current revision, and captures fresh evidence for the required responsive viewports and relevant interaction states. Carry that one revision identifier through the implementation, screenshots, state labels, and review request; never mix pre-designer, stale, or differently identified evidence.
3. `visioner` independently reviews only that current-revision evidence, read-only, for hierarchy, alignment, spacing, typography, clipping, overflow, contrast, state clarity, and cross-viewport consistency. Main review, source checks, static checks, and designer self-review do not count as independent visioner evidence.
4. For a supported visual finding, `designer` applies the bounded source revision, `task` rerenders and binds fresh evidence, and `visioner` reviews only the fresh rerender, at most once for that changed revision. Do not review an unchanged artifact.

Main only authorizes external effects during initial setup and accepts final delivery; it does not render, modify, reconcile, or mediate the visual loop. If `designer` is unavailable, record the specific unfulfilled design checkpoint and the Agent fallback reason. If `visioner` is unavailable, record the missing independent current-revision visual evidence. Findings remain advisory. This evidence chain does not route, block, select a fanout, launch automatic repairs, or decide completion.

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

Verify the implemented interface in its actual renderer and report concrete limitations. A source-only review is not visual evidence.
