---
name: opensource-pipeline
description: Prepare a private project for possible open-source release through a separate staging copy, independent sanitization, packaging, and explicit publish authorization. Use for requests to make a repository public or assess release readiness.
origin: ECC
---

# Open-Source Preparation Pipeline

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.
In that writer assignment, this pipeline also does not plan, dispatch, review,
or reassign another checkpoint.

Use the `release.opensource` workflow. Preparation never grants permission to publish.

## Required Inputs

- An explicit regular source directory, treated as read-only.
- A distinct empty or replaceable staging directory authorized by the user.
- Intended license, public project name, audience, and any paths that must remain private.
- Whether the request stops at readiness review or separately includes publication.

Reject a staging path that is the source, an ancestor of the source, or inside the source. Never copy `.git`, dependency caches, generated credentials, private datasets, signing material, local environment files, or host-specific state by default.

## Native OMP Assignments

For every bounded checkpoint, the parent first commits the literal TODO row `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`. Dispatch sets the native task item `agent` to the row Agent, then copies workflow, step, skills, and checkpoint into assignment byte 0: `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`. The task body copies all direct user constraints verbatim and adds no examples, then carries allowed effects and acceptance evidence; outer context, name, or label is not a substitute. Source, staging target, scope, and non-goals follow the prefix.

A named specialist is used only when the dynamic Available Agents inventory contains its exact name, the Agent is visible and matching, and Main can form a complete safe assignment. Otherwise Main chooses a visible native `task` for the bounded checkpoint; direct fallback is allowed only with a concrete Agent availability, capacity, or safety reason recorded in the affected TODO row. No fixed Agent identity is required, and this Skill creates no router or gate.

1. When `ecc-opensource-forker` is currently visible and matching, assign it to create the staging copy. It may write only within the authorized staging directory and returns a manifest of copied, excluded, replaced, and uncertain files. Otherwise use the bounded fallback above.
2. When `ecc-opensource-sanitizer` is currently visible and matching, assign it to independently inspect the staging copy read-only. It returns the sanitization findings and verdict inline; it must not write a report into the reviewed tree. Otherwise use the bounded fallback above.
3. If critical findings exist, stop and show them to the user. Any repair is a new, explicit bounded assignment followed by a fresh sanitizer review. Do not schedule an automatic retry loop.
4. After a clean sanitizer result, when `ecc-opensource-packager` is currently visible and matching, assign it to add only approved public packaging files in staging, such as README, LICENSE, CONTRIBUTING, setup guidance, and public-safe examples. Otherwise use the bounded fallback above.
5. When `reviewer` is currently visible and matching, assign it to compare the staging manifest, sanitizer evidence, package diff, and requested scope. Otherwise use the bounded fallback above. Re-run an independent read-only sanitization after packaging using a currently visible matching specialist or the same bounded fallback rule.

## Release Boundary

Return the staging path, manifest, exact scans, unresolved findings, license status, verification evidence, and a publish-readiness verdict. Repository creation, remote mutation, release creation, and push remain parent-owned operations under a separately composed `release.publish` workflow and explicit user authorization.

Do not run `gh repo create`, add a remote, or push from this preparation skill. A sanitizer PASS is evidence, not permission to publish.
