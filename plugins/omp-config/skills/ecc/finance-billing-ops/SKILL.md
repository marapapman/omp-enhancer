---
name: finance-billing-ops
description: Evidence-first revenue, pricing, refunds, team-billing, and billing-model truth workflow for ECC. Use when the user wants a sales snapshot, pricing comparison, duplicate-charge diagnosis, or code-backed billing reality instead of generic payments advice.
origin: ECC
---

# Finance Billing Ops

Use this when the user wants to understand money, pricing, refunds, team-seat logic, or whether the product actually behaves the way the website and sales copy imply.

This is broader than `customer-billing-ops`. That skill is for customer remediation. This skill is for operator truth: revenue state, pricing decisions, team billing, and code-backed billing behavior.

## Method Selection

Main selects supporting methods in the initial `WORKFLOW PLAN` when their Skills are visible. Later, Main loads a method only when an already loaded source explicitly reveals its exact same-namespace `skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI. This Skill provides domain guidance; it does not reroute the task, emit a replacement `WORKFLOW PLAN`, or auto-load another Skill.

## Candidate Methods

This source explicitly reveals these exact same-namespace resources for selection under that boundary:

- `skill://ecc-skill-catalog/customer-billing-ops/SKILL.md` for customer-specific remediation and follow-up
- `skill://ecc-skill-catalog/research-ops/SKILL.md` when competitor pricing or current market evidence matters
- `skill://ecc-skill-catalog/market-research/SKILL.md` when the answer should end in a pricing recommendation
- `skill://ecc-skill-catalog/github-ops/SKILL.md` when the billing truth depends on code, backlog, or release state in sibling repos
- `skill://ecc-skill-catalog/verification-loop/SKILL.md` when the answer depends on proving checkout, seat handling, or entitlement behavior

## When to Use

- user asks for Stripe sales, refunds, MRR, or recent customer activity
- user asks whether team billing, per-seat billing, or quota stacking is real in code
- user wants competitor pricing comparisons or pricing-model benchmarks
- the question mixes revenue facts with product implementation truth

## Guardrails

- distinguish live data from saved snapshots
- separate:
  - revenue fact
  - customer impact
  - code-backed product truth
  - recommendation
- do not say "per seat" unless the actual entitlement path enforces it
- do not assume duplicate subscriptions imply duplicate value

## Workflow

### 1. Start from the freshest billing evidence

Prefer live billing data. If the data is not live, state the snapshot timestamp explicitly.

Normalize the picture:

- paid sales
- active subscriptions
- failed or incomplete checkouts
- refunds
- disputes
- duplicate subscriptions

### 2. Separate customer incidents from product truth

If the question is customer-specific, classify first:

- duplicate checkout
- real team intent
- broken self-serve controls
- unmet product value
- failed payment or incomplete setup

Then separate that from the broader product question:

- does team billing really exist?
- are seats actually counted?
- does checkout quantity change entitlement?
- does the site overstate current behavior?

### 3. Inspect code-backed billing behavior

If the answer depends on implementation truth, inspect the code path:

- checkout
- pricing page
- entitlement calculation
- seat or quota handling
- installation vs user usage logic
- billing portal or self-serve management support

### 4. End with a decision and product gap

Report:

- sales snapshot
- issue diagnosis
- product truth
- recommended operator action
- product or backlog gap

## Output Format

```text
SNAPSHOT
- timestamp
- revenue / subscriptions / anomalies

CUSTOMER IMPACT
- who is affected
- what happened

PRODUCT TRUTH
- what the code actually does
- what the website or sales copy claims

DECISION
- refund / preserve / convert / no-op

PRODUCT GAP
- exact follow-up item to build or fix
```

## Pitfalls

- do not conflate failed attempts with net revenue
- do not infer team billing from marketing language alone
- do not compare competitor pricing from memory when current evidence is available
- do not jump from diagnosis straight to refund without classifying the issue

## Verification

- the answer includes a live-data statement or snapshot timestamp
- product-truth claims are code-backed
- customer-impact and broader pricing/product conclusions are separated cleanly
