---
name: writing-review
description: Post-writing review and revision guide — read checker output, prioritize issues by severity, guide user through fixes one at a time
---

# writing-review

## Purpose

After checkers have run, guide the user through fixing identified issues — one at a time, severity-sorted, with explicit confirmation before each change.

## Precondition

`.pi/research/checker_report.md` must exist. If it does not, run `/skill:writing-checkers` first.

## Invocation

`/skill:writing-review` — triggered after `writing-checkers` completes. The writer or checker agent invokes it.

## Workflow

### Step 1 — Read the checker report

Read `.pi/research/checker_report.md`. If the file is missing or empty, tell the user to run `/skill:writing-checkers` and stop.

### Step 2 — Sort issues by severity

Collect all issues from the report. Sort them into this order:

1. **CRITICAL** — factual errors, contradictions, broken logic, missing required sections
2. **IMPORTANT** — unclear claims, weak evidence, structural problems, tone violations
3. **MINOR** — typos, formatting, style nits, word choice

Within the same severity level, preserve the original order from the report.

### Step 3 — Process issues one at a time (up to 20)

For each issue, present to the user:

```
---
### Issue [N]: [checker name] — [severity]
- **Problem**: [specific text or problem from the report]
- **Suggestion**: [one concrete proposed fix]
---
```

Then ask the user to choose one of:

- **`accept`** — apply the suggested fix
- **`modify`** — the user provides an alternative fix, apply that instead
- **`skip`** — skip this issue (log it with the reason given)

**Important rules:**

- Wait for user input before showing the next issue. Never auto-advance.
- Never auto-apply fixes — always ask first.
- If the proposed fix would change the document's core argument or thesis, append **"⚠️ Needs author decision"** to the suggestion line. Let the user decide whether to proceed.
- Hard stop after **20 issues** in one session. Tell the user: *"Reached 20-issue limit. Re-run checkers to catch remaining issues."*

### Step 4 — Log every resolution

After each issue is resolved, append to `.pi/research/review_log.md`:

```
## Issue [N]: [checker name] [severity] [description]
- Resolution: fixed | modified | skipped
- Change: [what was changed, or reason for skipping]
```

Create the log file if it doesn't exist. Append, never overwrite.

### Step 5 — After all issues processed

Suggest re-running the checkers to verify fixes:

> All issues processed. Run `/skill:writing-checkers` to verify the changes.

If the session hit the 20-issue limit, add:

> You can run `/skill:writing-review` again after re-running checkers to handle remaining issues.

## Example interaction

```
---
### Issue 1: clarity-checker — CRITICAL
- **Problem**: "The claim 'all LLMs hallucinate equally' cites [1] but [1] tests only GPT-4."
- **Suggestion**: Change to "some LLMs hallucinate at different rates (cited in [1] for GPT-4)."
- **⚠️ Needs author decision**
---
accept / modify / skip?
```

User replies: `modify → Change to "LLMs vary in hallucination rates (see [1] for GPT-4 data)."`

```
## Issue 1: clarity-checker CRITICAL The claim 'all LLMs hallucinate equally' cites [1] but [1] tests only GPT-4.
- Resolution: modified
- Change: Rephrased to "LLMs vary in hallucination rates (see [1] for GPT-4 data)."
```

## File reference

| File | Role |
|---|---|
| `.pi/research/checker_report.md` | Input — checker output to review |
| `.pi/research/review_log.md` | Output — per-issue resolution log |
