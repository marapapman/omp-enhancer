---
name: format-human-comment-helper
description: "Process human review comments — parse, categorize, and suggest responses to reviewer feedback"
---

# Format Human Comment Helper

Help process human review comments on a document. Parse feedback, categorize each point, suggest responses, and estimate effort. Never auto-apply changes — always get confirmation.

## Trigger

Use when the user says "help me respond to reviews", "process this reviewer feedback", "categorize these comments", "draft responses to reviewer", or similar. Also when the user pastes review comments from a colleague, advisor, or submission venue.

## Categories

| Category | Label | Meaning |
|---|---|---|
| 🔴 Major Concern | `major` | Flaw in correctness, missing key experiment, broken reasoning. Must fix before acceptance. |
| 🟡 Minor Issue | `minor` | Unclear phrasing, missing citation, formatting error. Should fix but not blocking. |
| 🔵 Suggestion | `suggestion` | Reviewer proposes an alternative approach, additional analysis, or future direction. Evaluate on merit. |
| 🟢 Question | `question` | Reviewer asks for clarification. Answer directly, possibly with a text change to prevent future confusion. |

## Process

### Step 1: Parse

Read the full document and the user-provided review comments. Extract each distinct point from the reviewer. Number them.

### Step 2: Categorize

For each numbered point, assign one of the four categories above. When ambiguous, ask the user.

### Step 3: Analyze

For each point, determine:
- **Change needed** — what specific change (if any) to the document is required
- **Suggested response** — a draft reply to the reviewer (1–3 sentences)
- **Effort** — small (<1hr) / medium (1–4hr) / large (>4hr)

### Step 4: Output Table

Present all points in a single structured table, ordered by severity (major → minor → suggestion → question), with the most impactful items first.

## Output Format

```
# Review Comment Analysis

| # | Category | Point Summary | Change Needed | Suggested Response | Effort |
|---|---|---|---|---|---|
| 1 | 🔴 Major | ... | ... | ... | medium |
| 2 | 🟡 Minor | ... | ... | ... | small |
| 3 | 🔵 Suggestion | ... | ... | ... | large |
| 4 | 🟢 Question | ... | ... | ... | small |
```

After the table, ask: **"Shall I draft the changes for any of these? Reply with the number(s) or 'none'."**

### Step 5: Draft on Request

When the user picks a numbered item, propose concrete document edits. Present the exact changes inline. Ask again before applying.

## Guidelines

- **Preserve the reviewer's voice** — quote their feedback exactly when summarizing
- **Be honest about effort** — don't underestimate complex changes
- **Prioritize by impact** — a major concern on a core claim ranks above a major concern on a minor result
- **One table per review round** — if multiple rounds of feedback exist, process separately
- **Never apply changes without confirmation** — user must approve each change individually
- **When unsure about a category**, present the ambiguity and let the user decide
