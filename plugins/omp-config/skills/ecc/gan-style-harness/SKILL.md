---
name: gan-style-harness
description: Run a bounded adversarial quality cycle in which implementation and independent evaluation remain separate. Use for substantial UI or application work that needs strict functional and visual evidence, not for routine fixes.
origin: ECC-community
---

# Bounded Adversarial Quality Cycle

This skill is a composition pattern, not a standalone Agent loop. Main retains orchestration and chooses exact roles from the active workflows.

## Compose the Work

1. Use `code.dev` and `code-development` for the complete ordinary code lifecycle. Main searches local code, gathers bounded current external evidence when decision-relevant, and writes the detailed plan.
2. Give the complete plan to `plan` for a read-only `PLAN REVIEW`, then let Main execute each authorized vertical RED-GREEN-REFACTOR slice directly.
3. For visual work, compose `design.visual`: `designer` establishes layout and style, while `visioner` performs the required independent visual inspection when the workflow calls for it.
4. After fresh functional and browser evidence exists, give the bounded semantic diff to the native `reviewer`. Main validates findings and owns any repair.

## Cycle Contract

Before implementation, record the user stories, non-goals, exact acceptance checks, target routes, supported viewports, accessibility needs, and visual references. After one implementation batch, collect fresh tests, browser interactions, screenshots, console errors, and visual findings.

If evidence shows defects, Main may authorize one bounded repair checkpoint and repeat only the affected verification. Further cycles require an explicit TODO and a reason the next pass can resolve the remaining issue. Never run an unattended repeat-until-score loop, fabricate a numeric quality threshold, or continue merely because a reviewer found something.

## Completion Evidence

Return the implemented scope, exact test and browser commands, exit status, checked routes and viewports, screenshots or artifacts, independent visual and code-review findings, repairs made, and remaining limitations. Evaluation is evidence, not permission to publish or deploy.
