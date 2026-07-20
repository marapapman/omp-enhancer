---
name: tdd-workflow
description: Focused TDD evidence patterns for an assigned code slice when the selected code workflow needs explicit RED, GREEN, refactor, or coverage guidance.
origin: ECC
---

# Test-Driven Development Evidence

Use this guide inside an already selected code workflow. `code-development` owns the parent lifecycle, plan review, delegation, Main review, reviewer handoff, and final integration. This guide does not select a workflow, Agent, fork width, or completion condition.

## Actor boundary

For delegated implementation, native `task` owns the complete vertical RED-GREEN-REFACTOR slice it receives. The child owns its bounded tests and production change together, then returns the diff and command evidence. It does not own or rebase the parent TODO and does not dispatch another Agent. If no safe complete assignment can be formed, Main records the limitation and uses the selected workflow's direct fallback.

## RED

Before changing production behavior, create or identify the narrowest meaningful regression seam and run it:

- Runtime RED: the relevant target builds, the new or changed test executes, and it fails for the intended missing behavior or defect.
- Compile-time RED: the new test reaches the intended API or behavior and the resulting compile failure is itself the expected signal.

Syntax errors, unavailable dependencies, broken fixtures, unrelated failures, and tests that never execute are not valid RED evidence. If a runnable seam is unavailable, preserve the limitation and use the strongest relevant static or review evidence without inventing a passing test.

## GREEN

Make the smallest production change that addresses the observed RED. Rerun the same target and confirm that the reproducer passes. Run proportionate adjacent tests when the change crosses an integration boundary. Do not substitute a broad pre-existing green suite for the original reproducer.

## REFACTOR

After GREEN, remove duplication or clarify structure without widening behavior. Rerun the focused target after refactoring. Keep unrelated cleanup in a separate parent TODO slice.

## Coverage and test mix

Follow the repository's declared thresholds and the requested acceptance evidence. Choose unit, integration, browser, mutation, or end-to-end tests according to the changed behavior and risk; no universal percentage or mandatory test type applies. Report uncovered risk and unavailable evidence as limitations.

## Git authority

RED/GREEN evidence does not require commits. Creating, amending, squashing, rebasing, or pushing commits requires explicit user authorization for that effect. When authorized, preserve the user's dirty worktree, stage only reviewed paths, and keep the test/fix relationship visible without manufacturing evidence-only commits.

## Handoff

Return:

- the intended behavior and bounded scope;
- the exact RED command and relevant failure;
- the minimal production change;
- the matching GREEN command and result;
- any adjacent validation and remaining limitations.

Main integrates the delivery, performs `MAIN REVIEW`, and passes the bounded diff plus evidence to the selected reviewer when review is part of the parent plan. Reviewer findings remain advisory evidence.
