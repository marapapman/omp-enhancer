---
name: messages-ops
description: Evidence-first live messaging workflow for ECC. Use when the user wants to read texts or DMs, recover a recent one-time code, inspect a thread before replying, or prove which message source was actually checked.
origin: ECC
---

# Messages Ops

Use this when the task is live-message retrieval: iMessage, DMs, recent one-time codes, or thread inspection before a follow-up.

This is not email work. For a mailbox-dominant request, `skill://ecc-skill-catalog/email-ops/SKILL.md` is the applicable initial method.

## Method Selection

Main selects supporting methods in the initial `WORKFLOW PLAN` when their Skills are visible. Later, Main loads a method only when an already loaded source explicitly reveals its exact same-namespace `skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI. This Skill provides domain guidance; it does not reroute the task, emit a replacement `WORKFLOW PLAN`, or auto-load another Skill.

## Candidate Methods

This source explicitly reveals these exact same-namespace resources for selection under that boundary:

- `skill://ecc-skill-catalog/email-ops/SKILL.md` when the message task is really mailbox work
- `skill://ecc-skill-catalog/connections-optimizer/SKILL.md` when the DM thread belongs to outbound network work
- `skill://ecc-skill-catalog/lead-intelligence/SKILL.md` when the live thread should inform targeting or warm-path outreach
- `skill://ecc-skill-catalog/knowledge-ops/SKILL.md` when the thread contents need to be captured into durable context

## When to Use

- user says "read my messages", "check texts", "look in DMs", or "find the code"
- the task depends on a live thread or a recent code delivered to a local messaging surface
- the user wants proof of which source or thread was inspected

## Guardrails

- resolve the source first:
  - local messages
  - X / social DM
  - another browser-gated message surface
- do not claim a thread was checked without naming the source
- do not improvise raw database access if a checked helper or standard path exists
- if auth or MFA blocks the surface, report the exact blocker

## Workflow

### 1. Resolve the exact thread

Before doing anything else, settle:

- message surface
- sender / recipient / service
- time window
- whether the task is retrieval, inspection, or prep for a reply

### 2. Read before drafting

If the task may turn into an outbound follow-up:

- read the latest inbound
- identify the open loop
- then hand off to the correct outbound skill if needed

### 3. Handle codes as a focused retrieval task

For one-time codes:

- search the recent local message window first
- narrow by service or sender when possible
- stop once the code is found or the focused search is exhausted

### 4. Report exact evidence

Return:

- source used
- thread or sender when possible
- time window
- exact status:
  - read
  - code-found
  - blocked
  - awaiting reply draft

## Output Format

```text
SOURCE
- message surface
- sender / thread / service

RESULT
- message summary or code
- time window

STATUS
- read / code-found / blocked / awaiting reply draft
```

## Pitfalls

- do not blur mailbox work and DM/text work
- do not claim retrieval without naming the source
- do not burn time on broad searches when the ask is a recent-code lookup
- do not keep retrying a blocked auth path without surfacing the blocker

## Verification

- the response names the message source
- the response includes a sender, service, thread, or clear blocker
- the final state is explicit and bounded
