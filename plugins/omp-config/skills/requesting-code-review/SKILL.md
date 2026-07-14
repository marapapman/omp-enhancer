---
name: requesting-code-review
description: Request an independent OMP code review at a useful checkpoint with a bounded diff, requirements, and current verification evidence. Use after a coherent implementation batch or before merge.
---

# Requesting Code Review

Compose `code.review` and assign the exact canonical `reviewer`. The reviewer is read-only and receives the work product and evidence, not authority to repair it.

## Prepare the Review Packet

Include:

- user objective, acceptance criteria, and explicit non-goals;
- repository instructions and target paths;
- base and head revisions or the exact uncommitted diff scope;
- summary of behavior changed and compatibility obligations;
- tests, typechecks, builds, browser checks, or other commands actually run, with current exit status and limitations;
- known risks, generated files, and unrelated dirty-tree changes to ignore.

Do not claim commands ran when they did not. If a revision range is unavailable, provide the exact files and semantic change to inspect.

## Native Assignment

```text
workflow=code.review
step=<review checkpoint>
todo=<bounded review item>
role=reviewer
skills=<only relevant review and domain skills>
scope=<paths or revision range>
requirements=<behavior and non-goals>
evidence=<current commands and results>
```

Ask for prioritized findings with triggering conditions, impact, and file or symbol evidence. Require the reviewer to distinguish proven defects from hypotheses and to report when evidence is missing.

## Reconcile Findings

Validate each finding against the code and tests. Route supported in-scope repairs through `code.dev`, then run focused verification and obtain a fresh independent review when the semantic diff changed materially. Do not create an automatic review-repair loop or treat “no findings” as proof that untested behavior works.
