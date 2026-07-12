---
name: plan-execute-review-commit
description: "Advisory Plan → Execute → Review workflow, with Commit only when explicitly authorized"
---

# Plan → Execute → Review → Commit

Use the relevant stages at a depth proportional to the task. A commit is an optional final action, not an automatic stage.

## Stage 1: Plan 🔍
- Understand the request, read relevant files, analyze codebase
- Present a clear step-by-step plan to the user
- Request approval only when the plan contains a material unresolved choice; otherwise continue under the user's existing implementation authorization

## Stage 2: Execute 🛠️
- Implement changes one step at a time in order
- Verify each file after writing
- Fix issues immediately
- Run relevant tests/linters

## Stage 3: Review 👀
- Review ALL changed files for: correctness, edge cases, error handling, style consistency, security, performance
- Fix any issues found
- Present review summary

## Stage 4: Commit when requested ✅
- Enter this stage only when the user explicitly requested a commit or the active workflow already authorizes it
- `git add` relevant files
- `git diff --cached` to verify
- Commit with structured message:
  ```
  <type>(<scope>): <brief summary>

  <detailed description>
  ```
  Types: feat | fix | refactor | docs | style | test | chore | perf
- Push if requested

## Constraints
- For non-trivial work, present or persist a concise plan; do not manufacture a separate approval gate for a concrete authorized change
- No changes outside the approved plan's scope
- If something materially changes scope or authority, inform the user; otherwise adapt and continue
- Commit messages in the language of the codebase
