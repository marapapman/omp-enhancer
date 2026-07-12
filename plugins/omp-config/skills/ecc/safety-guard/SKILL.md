---
name: safety-guard
description: Advisory risk review for destructive, production, deployment, migration, and tightly scoped file operations
origin: ECC
---

# Safety Guard Advisory

Use this skill to make execution risk visible without creating a plugin-level
permission system. It provides guidance only; it does not intercept Bash,
Write, Edit, or other tools.

## Suggested Review

For a risky operation, check the smallest relevant set of questions:

- What exact file, repository, environment, service, or data set is targeted?
- Is the action reversible, and what recovery path actually exists?
- Does the current user request include this mutation or external action?
- Can a narrower command or target achieve the same result?
- What independent observation would verify the result?

Examples deserving extra attention include recursive deletion, force push,
hard reset, destructive database statements, production deployment, package
publication, cluster deletion, broad permission changes, and edits outside an
explicitly named directory.

## Workflow Behavior

Report unresolved target or authority questions once. Continue any safe,
authorized work that does not depend on them. Do not repeatedly attempt a
denied operation. The host sandbox, approval UI, and system policy decide
whether an action may execute.
