---
name: ito-data-atlas-agent
description: Design background Data Atlas style agents for Itô basket research, market discovery, parameter drafting, and human-in-the-loop editing. Use for architecture and workflow planning, not live order execution.
origin: ECC
---

# Itô Data Atlas Agent

Use this skill to design an agent that watches data sources, builds candidate
prediction-market baskets, drafts parameter changes, and hands the result to a
human for review.

This skill describes architecture and workflow. It does not run live trading.

## OMP Composition Boundary

Main owns cross-Skill composition: it selects every supporting workflow and Skill
in the initial `WORKFLOW PLAN` and loads each declared Skill before
`WORKFLOW READY`. After load, this loaded Skill does not reselect, reroute,
auto-load, or hand off to another Skill. It does not replace the parent TODO or
Main's Agent choice. An exact same-namespace
`skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI explicitly exposed here may be
read in one `RESOURCE EXTENSION` before `COMMIT`; cross-namespace candidates
remain initial-PLAN only.

## Guardrails

- Keep all execution behind explicit human approval.
- Require `ITO_API_KEY` only for read-only Itô data access unless a separate
  private implementation explicitly adds execution controls.
- Do not persist private user data unless the target repo already has a storage
  contract and the user asks for it.
- Do not expose private strategy logic, venue credentials, or local paths in
  public docs.

## Architecture Pattern

Use four lanes:

1. Research collector: public web, X, GitHub, venue docs, API metadata, and
   Itô read endpoints when gated access exists.
2. Basket drafter: turns sources into candidate underliers, weights, rules, and
   questions.
3. Risk reviewer: checks data freshness, venue limits, resolution ambiguity,
   compliance notes, and prompt-injection exposure.
4. Human editor: opens a chat or UI state where the user can approve, reject,
   adjust, or ask for more research.

## Workflow

1. Define the user objective and excluded actions.
2. List data sources and access requirements.
3. Draft a basket spec with provenance for every underlier.
4. Produce editable parameters rather than executable orders.
5. Store an audit trail: inputs, model output, sources, and human decision.

## Non-Routing PLAN Candidates

Main may select these only when their independent selection conditions match:

- Source collection: `skill://ecc-skill-catalog/deep-research/SKILL.md`
- Current social or event signals: `skill://ecc-skill-catalog/x-api/SKILL.md`
- Venue and underlier context: `skill://ecc-skill-catalog/ito-market-intelligence/SKILL.md`
- User knowledge-base matching: `skill://ecc-skill-catalog/ito-basket-compare/SKILL.md`
- Execution-integration risk evidence: `skill://ecc-skill-catalog/prediction-market-risk-review/SKILL.md`

## Output Contract

Return an implementation-ready workflow spec with:

- data sources
- access gates
- agent roles
- human approval points
- storage/audit boundary
- non-goals
