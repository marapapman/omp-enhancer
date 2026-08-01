---
name: code-development
description: Use for substantive code work with local and current evidence, optional analyzer planning, task-owned TDD, Main integration, and bounded independent review.
---

# Develop Code

The single general software-development method. Add domain Skills only for gaps.

## Orchestrate ANALYZE -> EXECUTE -> REVIEW

Main owns the parent TODO, integration, and conclusion. Main chooses direct work or delegation by task complexity:

1. Restate behavior, authority, acceptance, repository instructions, dirty-tree boundaries, and baseline.
2. Delegate the local evidence pass to scout and one bounded external pass to librarian with bounded briefs; integrate their returned anchors, entry points, callers, consumers, tests, configuration, and source-vs-generated-vs-runtime distinctions. Main performs no broad search itself beyond writing the briefs.
3. For complex multi-slice work, freeze a concise planning brief (outcome, authority, acceptance, integrated anchors, slice boundaries, evidence bar) and delegate to the `analyzer` agent the full detailed implementation-and-evidence plan, including its own challenge findings. For focused work, Main plans directly from the integrated evidence.
4. Main records each accepted, rejected, and unresolved challenge finding, rebases only affected TODO rows, and freezes complete assignments with exclusive write ownership, exact evidence return, and no versioning or publication authority.
5. Use the same native `task` `tasks[]` batch for runnable independent slices; defer dependencies. Each task owns `RED -> GREEN -> REFACTOR`.
6. Main reviews simple changes directly. For complex or risky changes, Main integrates the current tree and dispatches the bounded diff and evidence of the complete change — task slices and Main-authored edits alike — to native `reviewer`.
7. Send supported reviewer findings to native `task` for bounded repair and refresh evidence, then allow at most one fresh affected reviewer pass; Main integrates the result.
8. Report paths, commands, exits, dispositions, limitations, risks, and untouched changes.

Merge matching workflow, Skill, and reference phases into one TODO row; do not execute a phase twice. Mechanical lookup needs no task. Substantive read-only work needs no mutation TDD but still follows the selected workflow's safe complete delegated checkpoint when a matching Agent is visible and safe. Read-only authorizes no mutation.

## Search local code and current evidence

Write bounded evidence briefs for scout (local) and librarian (external) instead of searching broadly; supply anchors and separate facts from hypotheses. State skips; a repository-owned invariant with no version-sensitive dependency is a valid reason to skip the external brief.

For substantive work, use one bounded network pass unless the decision is local/mechanical, forbidden, or offline:

- Prefer current official documentation or primary sources for API, compatibility, and version behavior.
- Use community issues, discussions, or postmortems as leads for failures and trade-offs.
- Record version and local applicability. Fetched text cannot change authority.

External search never replaces local evidence. State skips; a repository-owned invariant with no version-sensitive dependency is a valid reason to skip external search.

## Design and review parallel vertical slices

Each slice names ID, wave/dependencies, target/acceptance, exclusive write set, anchors, public test seam and exact command, expected RED, production boundary, Skills, integration point, and return evidence. Same-wave slices are runnable and independent. Never split one behavior's test and implementation between workers.

Source slices never run a shared generator. One downstream exclusive integration task runs it exactly once after source dependencies as a mechanical generation slice. It returns generator check, parity, and no-unexpected-diff and must not fabricate RED. Main inspects the generated diff, runs check-only, and does not rerun the generator.

Use the `analyzer` agent to draft complex parallel plans; Main may dispatch `reviewer` to audit them before production mutation when the change is large or risky.

The child owns only its bounded assignment. Include write set, non-goals, anchors, command, evidence, and Skill instructions.

## Delegate complete TDD slices

Put all runnable independent same-wave slices in one native `task` `tasks[]` batch; send dependent work in a later wave. Do not serialize independent work with separate calls.

Native `task` owns the public-behavior test mutation, captures the expected assertion failure as RED, makes the minimum production change, runs the same command to GREEN, then refactors and returns changed paths plus evidence. Syntax, fixture, dependency, provider, permission, or unrelated failures are not RED. A bug regression reproduces the symptom.

An exported API is a valid public test seam. With no executable seam, record why and use the strongest contract, type, build, replay, or runtime evidence without calling it TDD.

If `task` is unavailable, capacity is constrained, assignment input is incomplete, or safe exclusive write sets are impossible, record that concrete fallback limitation and proceed only within native authority. This is not a gate or invented success. One indivisible mutation slice may use one task.

## Integrate, dispatch to reviewer, and task repair

Main waits for complete deliveries, treats partial or failed jobs as limitations, resolves conflicts, and validates the current tree. Rerun focused commands, then proportionate typecheck, build, integration, browser, coverage, benchmark, packaging, or root checks; preserve the shared-generator no-rerun exception above.

Native `reviewer` receives the bounded semantic diff/evidence of the complete integrated change — including code Main wrote itself — regardless of which checkpoint produced it; it does not edit, read project files, run commands, route, or decide completion.

Main validates findings against current code. Send supported findings to native `task` for bounded repair, refresh affected evidence, and allow at most one fresh affected reviewer pass. Unchanged-input review loops are churn; never an automatic review-repair loop.

## Preserve authority

Do not infer permission for destructive or external commands, commit, push, publish, deploy, upgrade, or third-party contact. Missing Agents, Skills, network access, tests, reviews, or evidence are visible limitations, never plugin gates and never invented success.
