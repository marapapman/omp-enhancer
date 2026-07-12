---
name: gateguard
description: Advisory pre-action investigation checklist for gathering concrete repository facts before risky or cross-cutting changes
origin: community
---

# GateGuard Advisory Investigation

Use this compatibility-named skill as a short evidence checklist. It does not
install a hook, deny a tool call, or require the agent to repeat an unchanged
action.

## When It Helps

- A change crosses module boundaries.
- A file consumes structured data with an unfamiliar schema.
- A command is destructive or difficult to reverse.
- The likely callers, targets, or rollback path are unclear.

## Suggested Check

Before a cross-cutting edit, gather only the facts that materially affect it:

1. Find direct callers, importers, or consumers of the target.
2. Identify the public behavior that may change.
3. Inspect relevant schemas or formats using redacted or synthetic values.
4. Reconfirm the target and scope from the current user request.

For a new file, also search for an existing implementation serving the same
purpose. For a destructive command, summarize the affected target and a
realistic recovery option.

## Bounded Use

Perform one proportionate investigation pass, then proceed with the best
available evidence. If a fact cannot be observed, label the limitation rather
than inventing an answer or retrying the same search. Host sandboxing and
approval remain authoritative for execution safety.

No GateGuard hook or external package is bundled or required by this skill.
