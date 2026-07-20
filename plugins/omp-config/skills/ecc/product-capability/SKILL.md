---
name: product-capability
description: Translate PRD intent, roadmap asks, or product discussions into an implementation-ready capability plan that exposes constraints, invariants, interfaces, and unresolved decisions before multi-service work starts. Use when the user needs an ECC-native PRD-to-SRS lane instead of vague planning prose.
origin: ECC
---

# Product Capability

This skill turns product intent into explicit engineering constraints.

Apply it after Main selects and loads this resource for the gap between "what should we build?" and "what exactly must be true before implementation starts?"

## Selected task scope

- A PRD, roadmap item, discussion, or founder note exists, but the implementation constraints are still implicit
- A feature crosses multiple services, repos, or teams and needs a capability contract before coding
- Product intent is clear, but architecture, data, lifecycle, or policy implications are still fuzzy
- Senior engineers keep restating the same hidden assumptions during review
- You need a reusable artifact that can survive across harnesses and sessions

## Canonical Artifact

Keep the capability result response-local by default. A persistent capability artifact may be created or updated only for the exact named path and operation with explicit user authorization plus native permission at execution time.

If that authority names an existing durable product-context file such as `PRODUCT.md`, `docs/product/`, or a program-spec directory, update only the named target.

If no capability manifest exists, return the proposed content in the response. Use this project template only when it exists and the authorized write names the destination:

- `docs/examples/product-capability-template.md`

The goal is not to create another planning stack. The goal is to make hidden capability constraints durable and reusable.

## Non-Negotiable Rules

- Do not invent product truth. Mark unresolved questions explicitly.
- Separate user-visible promises from implementation details.
- Call out what is fixed policy, what is architecture preference, and what is still open.
- If the request conflicts with existing repo constraints, say so clearly instead of smoothing it over.
- Prefer one reusable capability artifact over scattered ad hoc notes.

## Inputs

Read only what is needed:

1. Product intent
   - issue, discussion, PRD, roadmap note, founder message
2. Current architecture
   - relevant repo docs, contracts, schemas, routes, existing workflows
3. Existing capability context
   - `PRODUCT.md`, design docs, RFCs, migration notes, operating-model docs
4. Delivery constraints
   - auth, billing, compliance, rollout, backwards compatibility, performance, review policy

## Core Workflow

### 1. Restate the capability

Compress the ask into one precise statement:

- who the user or operator is
- what new capability exists after this ships
- what outcome changes because of it

If this statement is weak, the implementation will drift.

### 2. Resolve capability constraints

Extract the constraints that must hold before implementation:

- business rules
- scope boundaries
- invariants
- trust boundaries
- data ownership
- lifecycle transitions
- rollout / migration requirements
- failure and recovery expectations

These are the things that often live only in senior-engineer memory.

### 3. Define the implementation-facing contract

Produce an SRS-style capability plan with:

- capability summary
- explicit non-goals
- actors and surfaces
- required states and transitions
- interfaces / inputs / outputs
- data model implications
- security / billing / policy constraints
- observability and operator requirements
- open questions blocking implementation

### 4. Translate into execution

End with one capability-readiness finding:

- ready for direct implementation
- needs architecture review first
- needs product clarification first

Capability readiness is a domain finding, not host completion, release permission, implementation permission, or approval to start another task.

Each exact Skill URI below is only a candidate for a new `WORKFLOW PLAN` chosen by Main; this body does not automatically load, hand off to, or reselect any of them:

- `skill://ecc-skill-catalog/project-flow-ops/SKILL.md`
- `skill://ecc-skill-catalog/workspace-surface-audit/SKILL.md`
- `skill://ecc-skill-catalog/api-connector-builder/SKILL.md`
- `skill://ecc-skill-catalog/dashboard-builder/SKILL.md`
- `skill://ecc-skill-catalog/tdd-workflow/SKILL.md`
- `skill://ecc-skill-catalog/verification-loop/SKILL.md`

## Output Format

Return the result in this order:

```text
CAPABILITY
- one-paragraph restatement

CONSTRAINTS
- fixed rules, invariants, and boundaries

IMPLEMENTATION CONTRACT
- actors
- surfaces
- states and transitions
- interface/data implications

NON-GOALS
- what this lane explicitly does not own

OPEN QUESTIONS
- blockers or product decisions still required

NEXT-METHOD CANDIDATES
- exact Skill URIs that Main may consider in a new plan
```

## Good Outcomes

- Product intent is now concrete enough to implement without rediscovering hidden constraints mid-PR.
- Engineering review has a durable artifact instead of relying on memory or Slack context.
- The resulting plan is reusable across Claude Code, Codex, Cursor, OpenCode, and ECC 2.0 planning surfaces.
