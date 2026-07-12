---
name: verification-loop
description: Advisory bounded verification checklist for builds, types, lint, tests, security signals, and diff review
origin: ECC
---

# Bounded Verification Review

This compatibility-named skill recommends one proportionate verification pass.
It does not control session completion or require repeated repairs.

## Choose Relevant Checks

Use only checks supported by the repository and requested scope:

1. Build or compile the affected target.
2. Run the relevant type checker or static analyzer.
3. Run the narrowest useful lint and test commands.
4. Inspect security-sensitive changes and accidental secret exposure.
5. Review the semantic diff for unintended files or behavior.

Do not invent commands. Discover scripts and project conventions first. Avoid
masked failures, empty suites, and dry runs when claiming successful evidence.

## Bounded Failure Handling

If a check fails, preserve the observed output, make at most one focused repair
when repair is in scope, and rerun the affected check once. If it remains
unresolved, report the result and continue any independent checks. Do not loop
until a preferred status appears.

## Report

Summarize each attempted check as passed, failed, or unavailable, including the
observed command or evidence source. State limitations directly. Readiness is a
reporting judgment, not a plugin permission or a reason to prevent the host
session from ending.
