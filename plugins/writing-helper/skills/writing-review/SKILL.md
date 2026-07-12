---
name: writing-review
description: Bounded English writing review that applies authorized safe fixes in one pass and reports substantive decisions
---

# Writing Review

Use `.pi/research/checker_report.md` when available. If it is absent, review the
user-specified text directly and state that no prior checker report was used.

## Default One-Pass Workflow

1. Sort findings as critical, important, or minor while preserving their order
   within each severity.
2. Apply clarity, grammar, structure, tone, and formatting fixes that stay
   within the user's existing edit authorization and preserve claims.
3. Do not silently change a factual statement, central argument, citation
   meaning, or requested scope. Present those items as author decisions.
4. Review the resulting text once and summarize applied changes, unresolved
   decisions, and evidence limitations.

Process at most 20 findings in one pass. Summarize any remainder without
starting another checker/review cycle automatically.

## Optional Interactive Mode

Use accept, modify, or skip prompts one issue at a time only when the user
explicitly requests issue-by-issue review or when one material decision is
needed. Ordinary requests such as "polish this section" already authorize safe
writing fixes and do not require a confirmation after every issue.

## Logging

When `.pi/research/review_log.md` is part of the active workflow, append a short
record for each applied, deferred, or skipped finding. Do not create workflow
files that the user did not request merely to satisfy this skill.

Load `writing-checkers` through the runtime's normal skill mechanism when an
additional review was explicitly requested. Legacy slash-skill text is
documentation, not a command to attempt.
