---
name: social-graph-ranker
description: Weighted social-graph ranking for warm intro discovery, bridge scoring, and network gap analysis across X and LinkedIn. Use when the user wants the reusable graph-ranking engine itself, not the broader outreach or network-maintenance workflow layered on top of it.
origin: ECC
---

# Social Graph Ranker

Canonical weighted graph-ranking layer for network-aware outreach.

## Workflow composition boundary

Main selects supporting Skills in the initial `WORKFLOW PLAN` when they are
visible. This Skill does not select or auto-load another Skill, reroute the
workflow, or emit a replacement plan after `WORKFLOW READY`.

If this already-loaded guide reveals a needed method that was not visible before
PLAN, the remaining linked-method batch may read only a matching exact
same-namespace URI listed here:

`RESOURCE EXTENSION | source=skill://ecc-skill-catalog/social-graph-ranker/SKILL.md | reads=<only-needed-exact-URI-or-URIs-listed-below>`

- `skill://ecc-skill-catalog/lead-intelligence/SKILL.md`
- `skill://ecc-skill-catalog/connections-optimizer/SKILL.md`
- `skill://ecc-skill-catalog/brand-voice/SKILL.md`
- `skill://ecc-skill-catalog/x-api/SKILL.md`

Use this when the user needs to:

- rank existing mutuals or connections by intro value
- map warm paths to a target list
- measure bridge value across first- and second-order connections
- decide which targets deserve warm intros versus direct cold outreach
- understand the graph math independently from `lead-intelligence` or `connections-optimizer`

## When To Use This Standalone

Choose this skill when the user primarily wants the ranking engine:

- "who in my network is best positioned to introduce me?"
- "rank my mutuals by who can get me to these people"
- "map my graph against this ICP"
- "show me the bridge math"

This method is insufficient by itself for the following scopes; Main should
select the matching candidate during PLAN when it is visible:

- full lead generation and outbound sequencing -> `lead-intelligence`
- pruning, rebalancing, and growing the network -> `connections-optimizer`

## Inputs

Collect or infer:

- target people, companies, or ICP definition
- the user's current graph on X, LinkedIn, or both
- weighting priorities such as role, industry, geography, and responsiveness
- traversal depth and decay tolerance

## Core Model

Given:

- `T` = weighted target set
- `M` = your current mutuals / direct connections
- `d(m, t)` = shortest hop distance from mutual `m` to target `t`
- `w(t)` = target weight from signal scoring

Base bridge score:

```text
B(m) = Σ_{t ∈ T} w(t) · λ^(d(m,t) - 1)
```

Where:

- `λ` is the decay factor, usually `0.5`
- a direct path contributes full value
- each extra hop halves the contribution

Second-order expansion:

```text
B_ext(m) = B(m) + α · Σ_{m' ∈ N(m) \\ M} Σ_{t ∈ T} w(t) · λ^(d(m',t))
```

Where:

- `N(m) \\ M` is the set of people the mutual knows that you do not
- `α` discounts second-order reach, usually `0.3`

Response-adjusted final ranking:

```text
R(m) = B_ext(m) · (1 + β · engagement(m))
```

Where:

- `engagement(m)` is normalized responsiveness or relationship strength
- `β` is the engagement bonus, usually `0.2`

Interpretation:

- Tier 1: high `R(m)` and direct bridge paths -> warm intro asks
- Tier 2: medium `R(m)` and one-hop bridge paths -> conditional intro asks
- Tier 3: low `R(m)` or no viable bridge -> direct outreach or follow-gap fill

## Scoring Signals

Weight targets before graph traversal with whatever matters for the current priority set:

- role or title alignment
- company or industry fit
- current activity and recency
- geographic relevance
- influence or reach
- likelihood of response

Weight mutuals after traversal with:

- number of weighted paths into the target set
- directness of those paths
- responsiveness or prior interaction history
- contextual fit for making the intro

## Workflow

1. Build the weighted target set.
2. Pull the user's graph from X, LinkedIn, or both.
3. Compute direct bridge scores.
4. Expand second-order candidates for the highest-value mutuals.
5. Rank by `R(m)`.
6. Return:
   - best warm intro asks
   - conditional bridge paths
   - graph gaps where no warm path exists

## Output Shape

```text
SOCIAL GRAPH RANKING
====================

Priority Set:
Platforms:
Decay Model:

Top Bridges
- mutual / connection
  base_score:
  extended_score:
  best_targets:
  path_summary:
  recommended_action:

Conditional Paths
- mutual / connection
  reason:
  extra hop cost:

No Warm Path
- target
  recommendation: direct outreach / fill graph gap
```

## Related Skills

- A committed `lead-intelligence` candidate may use this ranking model inside the broader target-discovery and outreach pipeline.
- A committed `connections-optimizer` candidate may use the same bridge logic when deciding who to keep, prune, or add.
- Reuse a `brand-voice` profile before drafting only when that candidate was selected and loaded under the composition boundary.
- A committed `x-api` candidate can provide X graph access; any execution path remains separately authorized.
