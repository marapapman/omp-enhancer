---
name: terminal-ops
description: Evidence-first repo execution workflow for ECC. Use when the user wants a command run, a repo checked, a CI failure debugged, or a narrow fix pushed with exact proof of what was executed and verified.
origin: ECC
---

# Terminal Ops

Use this when the user wants real repo execution: run commands, inspect git state, debug CI or builds, make a narrow fix, and report exactly what changed and what was verified.

This skill is intentionally narrower than general coding guidance. It is an operator workflow for evidence-first terminal execution.

## Method Selection

Main selects supporting methods in the initial `WORKFLOW PLAN` when their Skills are visible. Later, Main loads a method only when an already loaded source explicitly reveals its exact same-namespace `skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI. This Skill provides domain guidance; it does not reroute the task, emit a replacement `WORKFLOW PLAN`, or auto-load another Skill.

## Candidate Methods

This source explicitly reveals these exact same-namespace resources for selection under that boundary:

- `skill://ecc-skill-catalog/verification-loop/SKILL.md` for exact proving steps after changes
- `skill://ecc-skill-catalog/tdd-workflow/SKILL.md` when the right fix needs regression coverage
- `skill://ecc-skill-catalog/security-review/SKILL.md` when secrets, auth, or external inputs are involved
- `skill://ecc-skill-catalog/github-ops/SKILL.md` when the task depends on CI runs, PR state, or release status
- `skill://ecc-skill-catalog/knowledge-ops/SKILL.md` when the verified outcome needs to be captured into durable project context

## When to Use

- user says "fix", "debug", "run this", "check the repo", or "push it"
- the task depends on command output, git state, test results, or a verified local fix
- the answer must distinguish changed locally, verified locally, committed, and pushed

## Guardrails

- inspect before editing
- stay read-only if the user asked for audit/review only
- prefer repo-local scripts and helpers over improvised ad hoc wrappers
- do not claim fixed until the proving command was rerun
- do not claim pushed unless the branch actually moved upstream

## Workflow

### 1. Resolve the working surface

Settle:

- exact repo path
- branch
- local diff state
- requested mode:
  - inspect
  - fix
  - verify
  - push

### 2. Read the failing surface first

Before changing anything:

- inspect the error
- inspect the file or test
- inspect git state
- use any already-supplied logs or context before re-reading blindly

### 3. Keep the fix narrow

Solve one dominant failure at a time:

- use the smallest useful proving command first
- only escalate to a bigger build/test pass after the local failure is addressed
- if a command keeps failing with the same signature, stop broad retries and narrow scope

### 4. Report exact execution state

Use exact status words:

- inspected
- changed locally
- verified locally
- committed
- pushed
- blocked

## Output Format

```text
SURFACE
- repo
- branch
- requested mode

EVIDENCE
- failing command / diff / test

ACTION
- what changed

STATUS
- inspected / changed locally / verified locally / committed / pushed / blocked
```

## Pitfalls

- do not work from stale memory when the live repo state can be read
- do not widen a narrow fix into repo-wide churn
- do not use destructive git commands
- do not ignore unrelated local work

## Verification

- the response names the proving command or test
- git-related work names the repo path and branch
- any push claim includes the target branch and exact result
