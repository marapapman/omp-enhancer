---
name: frontend-design
description: Design or refine production web interfaces with clear visual hierarchy, layout, typography, color, and interaction states.
---

# Frontend design

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Use this when the requested deliverable is visual UI design or UI polish.

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
