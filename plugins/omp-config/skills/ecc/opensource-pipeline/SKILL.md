---
name: opensource-pipeline
description: Prepare a private project for possible open-source release through a separate staging copy, independent sanitization, packaging, and explicit publish authorization. Use for requests to make a repository public or assess release readiness.
origin: ECC
---

# Open-Source Preparation Pipeline

Use the `release.opensource` workflow. Preparation never grants permission to publish.

## Required Inputs

- An explicit regular source directory, treated as read-only.
- A distinct empty or replaceable staging directory authorized by the user.
- Intended license, public project name, audience, and any paths that must remain private.
- Whether the request stops at readiness review or separately includes publication.

Reject a staging path that is the source, an ancestor of the source, or inside the source. Never copy `.git`, dependency caches, generated credentials, private datasets, signing material, local environment files, or host-specific state by default.

## Native OMP Assignments

The parent creates one bounded native `task` assignment per checkpoint and includes `workflow=release.opensource`, the exact step/TODO item, source, staging target, scope, and skills.

1. Assign `ecc-opensource-forker` to create the staging copy. It may write only within the authorized staging directory and returns a manifest of copied, excluded, replaced, and uncertain files.
2. Assign `ecc-opensource-sanitizer` to independently inspect the staging copy read-only. It returns the sanitization findings and verdict inline; it must not write a report into the reviewed tree.
3. If critical findings exist, stop and show them to the user. Any repair is a new, explicit bounded assignment followed by a fresh sanitizer review. Do not schedule an automatic retry loop.
4. After a clean sanitizer result, assign `ecc-opensource-packager` to add only approved public packaging files in staging, such as README, LICENSE, CONTRIBUTING, setup guidance, and public-safe examples.
5. Assign `reviewer` to compare the staging manifest, sanitizer evidence, package diff, and requested scope. Re-run an independent read-only sanitization after packaging.

## Release Boundary

Return the staging path, manifest, exact scans, unresolved findings, license status, verification evidence, and a publish-readiness verdict. Repository creation, remote mutation, release creation, and push remain parent-owned operations under a separately composed `release.publish` workflow and explicit user authorization.

Do not run `gh repo create`, add a remote, or push from this preparation skill. A sanitizer PASS is evidence, not permission to publish.
