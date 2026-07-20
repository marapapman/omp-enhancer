---
name: finishing-a-development-branch
description: Use when implementation is complete and the user wants verified, structured choices for keeping, locally integrating, publishing, or cleaning up a development branch without bundling unrelated Git effects.
---

# Finishing a Development Branch

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Verify the work, inspect the actual Git environment, present applicable branch
options, and perform only the option and effects the user authorizes.

## Authority and effect boundaries

OMP native tools, permissions, approvals, and workspace ownership remain
authoritative. Use only currently exposed host capabilities. A Skill, passing
test, or readiness finding does not authorize a Git mutation or remote effect.

Treat commit, local merge, fetch, pull, push, pull request creation, branch
deletion, worktree removal, and force operations as separate effects requiring
explicit user authorization for the named repository and target. A local merge
does not authorize fetch, pull, push, or any other remote access. If updating the
base from a remote matters, offer that as a separate operation and wait for its
authorization. A merge that will create a commit needs explicit merge-commit
authorization; do not infer it from a generic request to finish or inspect work.

Preserve every dirty worktree change. Never reset, overwrite, stage, commit,
delete, or move unrelated user work. Stop before a mutation when overlapping
dirty changes, an unknown workspace owner, or ambiguous target makes the selected
effect unsafe.

## Process

### 1. Validate the completed work

Inspect the current branch, status, diff, upstream relationship, and available
test evidence. Run the relevant focused and broader checks only when command
execution is authorized and available. Report failed, skipped, unavailable, and
stale checks honestly.

Do not integrate or publish failing work merely to close the workflow. Ask for a
repair only when it is in scope; otherwise leave the branch intact and report the
limitation.

### 2. Detect repository and workspace state

Use read-only Git inspection where available:

```bash
git status --short --branch
git rev-parse --show-toplevel
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
```

Determine the likely base from local evidence such as merge-base and local refs.
Do not contact a remote merely to discover it. Distinguish a normal checkout,
owned worktree, harness-owned worktree, named branch, and detached HEAD. If the
base or ownership remains ambiguous, state it before offering a destructive or
integrating option.

### 3. Present applicable branch options

Choose branch options from the current context and the user's requested outcome.
Keep each effect visible instead of combining several permissions into one label.
Typical choices are:

1. Keep the branch and worktree unchanged.
2. Merge into the named local base without remote access.
3. Push the named branch.
4. Create a pull request after its required branch is available remotely.
5. Delete the named local branch or remove an owned worktree.

Omit impossible choices, such as local branch merge from an externally managed
detached checkout. Explain whether a local merge can fast-forward or would create
a merge commit. A push choice does not also authorize pull-request creation, and
a merge choice does not also authorize branch or worktree cleanup.

### 4. Execute only the selected effect

Reconfirm the repository, source branch, target branch, dirty state, and exact
effect immediately before mutation. Use host approval when required.

For an authorized local merge, change to the correct repository root and operate
only on local refs:

```bash
git checkout <base-branch>
git merge <feature-branch>
```

Do not contact a remote in this path. If the merge conflicts, preserve the
conflict state only when the user and host permit it; otherwise report the state
without deleting or resetting user work.

For separately authorized publication, perform only the named remote operation:

```bash
git push -u <remote> <feature-branch>
gh pr create --base <base-branch> --head <feature-branch>
```

Treat those as independent examples. Use only an exposed tool and the exact
authorized remote, branch, repository, and PR target.

For deletion or cleanup, show the exact branch, commits, and worktree path, then
obtain explicit destructive confirmation. Remove a worktree only when provenance
shows that this workflow owns it; never remove a host- or harness-owned workspace.
Run cleanup from a safe repository root, not from inside the worktree being
removed.

### 5. Validate and report the resulting state

Validate before and after every authorized mutation. After a local merge, rerun
the relevant checks and inspect local status and refs. After a push or pull request,
independently verify the exact remote branch or PR when the exposed host tools
permit it. After cleanup, verify only the paths and refs the operation owned.

Report the selected effect, exact target, validation evidence, final branch and
worktree state, remaining dirty changes, remote state if observed, and any
limitations. Never claim a commit, merge, push, PR, deletion, or cleanup that was
not independently observed.
