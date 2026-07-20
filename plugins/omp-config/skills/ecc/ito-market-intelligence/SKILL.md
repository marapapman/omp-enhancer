---
name: ito-market-intelligence
description: Research prediction-market events, venues, underliers, liquidity, and news context for Itô basket workflows. Use for read-only market intelligence, API-gated Itô exploration, and source-grounded prediction-market briefings without investment advice or live trading.
origin: ECC
---

# Itô Market Intelligence

Use this skill when a user wants prediction-market context, event discovery,
venue comparison, basket theme exploration, or an Itô API-backed market brief.

This is a public teaser skill. It can work with public sources by default. Any
Itô-backed data call requires explicit API access through `ITO_API_KEY`.

## Workflow composition boundary

Main selects supporting Skills in the initial `WORKFLOW PLAN` when they are
visible. This Skill does not select or auto-load another Skill, reroute the
workflow, or emit a replacement plan after `WORKFLOW READY`.

If this already-loaded guide reveals a needed method that was not visible before
PLAN, the remaining linked-method batch may read only a matching exact
same-namespace URI listed here:

`RESOURCE EXTENSION | source=skill://ecc-skill-catalog/ito-market-intelligence/SKILL.md | reads=<only-needed-exact-URI-or-URIs-listed-below>`

- `skill://ecc-skill-catalog/deep-research/SKILL.md`
- `skill://ecc-skill-catalog/exa-search/SKILL.md`
- `skill://ecc-skill-catalog/x-api/SKILL.md`
- `skill://ecc-skill-catalog/market-research/SKILL.md`
- `skill://ecc-skill-catalog/prediction-market-risk-review/SKILL.md`

## Guardrails

- Do not provide investment, legal, tax, or trading advice.
- Do not place, cancel, route, or simulate live orders.
- Do not infer the user's financial situation unless they provide it.
- Treat Polymarket, Kalshi, Itô, X, Exa, GitHub, and web data as source inputs,
  not as truth by themselves.
- Separate facts, market-implied signals, and your interpretation.

## Workflow

1. Clarify the market theme, venue, geography, and time horizon.
2. Gather public market data from venue docs/APIs or source-grounded research.
3. If `ITO_API_KEY` is present and the user explicitly asks for Itô data, call
   only read endpoints and state that access is gated.
4. Normalize event, underlier, liquidity, fee, resolution, and data-latency
   differences across venues.
5. Produce a decision brief:
   - market/event summary
   - available venues and underliers
   - liquidity and data-quality caveats
   - relevant news/source context
   - open questions before any user action

## PLAN-stage compatibility candidates

- A committed `deep-research` or `exa-search` candidate can supply source discovery.
- A committed `x-api` candidate can supply public social signals when X access is configured and authorized.
- A committed `market-research` candidate can supply market sizing, competitor, or business-use-case methods.
- Before any authorized workflow touches user capital, portfolio data, or execution-capable credentials, the committed plan must include the `prediction-market-risk-review` method; otherwise stop at the read-only brief and report the limitation.

## Output Contract

Default to a compact brief with source links and a clear caveat:

```text
This is market intelligence, not investment or trading advice.
```

If access is missing, say:

```text
Itô live basket/API data requires gated access. Request an ITO_API_KEY before
using Itô-backed reads.
```
