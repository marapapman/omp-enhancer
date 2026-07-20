---
name: ralphinho-rfc-pipeline
description: RFC decomposition reference for turning a large feature into dependency-aware, independently verifiable work units within the selected code workflow.
origin: ECC
---

# RFC Work-Unit Decomposition

Use this guide when a large feature needs a dependency graph before implementation. Main owns the parent plan, native TODO, integration, review, and final response. This guide supplies decomposition fields; it is not a second router, merge queue, repair loop, or completion controller.

## Unit contract

Each proposed work unit records:

- `id` and exact scope;
- `depends_on` with the concrete reason for each dependency;
- assignment inputs and direct constraints;
- acceptance tests and expected RED/GREEN evidence;
- integration anchors and rollback notes;
- files or components it may mutate.

Prefer vertical behavior slices over separate test and production-code units. Keep shared generators or mechanical integration as dependency-ordered Main slices when parallel mutation would conflict.

## Main-owned execution

Main maps accepted units into its detailed TODO and checks which are runnable and independent. It chooses from dynamic Available Agents and current capacity; a matching domain Agent is preferred, otherwise native `task` may own a safe complete unit. Runnable independent units may be submitted together, while dependent units wait for their anchors.

Every implementation child owns one complete vertical TDD slice and returns evidence. Main integrates successful deliveries, performs visible review, and sends the bounded diff and evidence to a reviewer when the parent plan calls for review. No fixed Agent count, mandatory branch-per-unit scheme, or automatic redispatch follows from this guide.

## Stalls and integration findings

A stalled, conflicting, or incomplete unit returns its partial evidence and limitation to Main. Main decides whether the parent TODO needs a narrower replacement slice; the guide does not retry automatically.

Branch creation, commit, rebase, merge, push, and publication require explicit user authorization for the named effect. Dependency failures and review findings remain visible evidence, not permission to merge or a plugin-owned completion gate.

## Output

Return only the decomposition material the parent plan needs:

- dependency graph or ordered unit table;
- unit contracts;
- integration risks and shared anchors;
- proposed validation evidence;
- unresolved assumptions.
