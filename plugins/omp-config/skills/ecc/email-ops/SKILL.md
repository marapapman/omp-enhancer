---
name: email-ops
description: Evidence-first mailbox triage, drafting, send verification, and sent-mail-safe follow-up workflow for ECC. Use when the user wants to organize email, draft or send through the real mail surface, or prove what landed in Sent.
origin: ECC
---

# Email Ops

Use this when the real task is mailbox work: triage, drafting, replying, sending, or proving a message landed in Sent.

This is not a generic writing skill. It is an operator workflow around the actual mail surface.

## Method Selection

Main selects supporting methods in the initial `WORKFLOW PLAN` when their Skills are visible. Later, Main loads a method only when an already loaded source explicitly reveals its exact same-namespace `skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI. This Skill provides domain guidance; it does not reroute the task, emit a replacement `WORKFLOW PLAN`, or auto-load another Skill.

## Candidate Methods

This source explicitly reveals these exact same-namespace resources for selection under that boundary:

- `skill://ecc-skill-catalog/brand-voice/SKILL.md` before drafting anything user-facing
- `skill://ecc-skill-catalog/investor-outreach/SKILL.md` for investor, partner, or sponsor-facing mail
- `skill://ecc-skill-catalog/customer-billing-ops/SKILL.md` when the thread is a billing/support incident rather than generic correspondence
- `skill://ecc-skill-catalog/knowledge-ops/SKILL.md` when the message or thread should be captured into durable context afterward
- `skill://ecc-skill-catalog/research-ops/SKILL.md` when a reply depends on fresh external facts

## When to Use

- user asks to triage inbox or archive low-signal mail
- user wants a draft, reply, or new outbound email
- user wants to know whether a mail was already sent
- the user wants proof of which account, thread, or Sent entry was used

## Guardrails

- draft first unless the user clearly asked for a live send
- never claim a message was sent without a real Sent-folder or client-side confirmation
- do not switch sender accounts casually; choose the account that matches the project and recipient
- do not delete uncertain business mail during cleanup
- for a DM- or iMessage-dominant request, `skill://ecc-skill-catalog/messages-ops/SKILL.md` is the applicable initial method

## Workflow

### 1. Resolve the exact surface

Before acting, settle:

- which mailbox account
- which thread or recipient
- whether the task is triage, draft, reply, or send
- whether the user wants draft-only or live send

### 2. Read the thread before composing

If replying:

- read the existing thread
- identify the last outbound touch
- identify any commitments, deadlines, or unanswered questions

If creating a new outbound:

- identify warmth level
- select the correct channel and sender account
- when Method Selection loaded `skill://ecc-skill-catalog/brand-voice/SKILL.md`, apply its voice profile before drafting

### 3. Draft, then verify

For draft-only work:

- produce the final copy
- state sender, recipient, subject, and purpose

For live-send work:

- verify the exact final body first
- send through the chosen mail surface
- confirm the message landed in Sent or the equivalent sent-copy store

### 4. Report exact state

Use exact status words:

- drafted
- approval-pending
- sent
- blocked
- awaiting verification

If the send surface is blocked, preserve the draft and report the exact blocker instead of improvising a second transport without saying so.

## Output Format

```text
MAIL SURFACE
- account
- thread / recipient
- requested action

DRAFT
- subject
- body

STATUS
- drafted / sent / blocked
- proof of Sent when applicable

NEXT STEP
- send
- follow up
- archive / move
```

## Pitfalls

- do not claim send success without a sent-copy check
- do not ignore the thread history and write a contextless reply
- do not mix mailbox work with DM or text-message workflows
- do not expose secrets, auth details, or unnecessary message metadata

## Verification

- the response names the account and thread or recipient
- any send claim includes Sent proof or an explicit client-side confirmation
- the final state is one of drafted / sent / blocked / awaiting verification
