---
name: prediction-market-oracle-research
description: Research prediction markets as data sources or oracle signals for products, agents, dashboards, and corporate decision intelligence. Use for source-grounded analysis of market-implied probabilities, caveats, and integration patterns without investment advice.
origin: ECC
---

# Prediction Market Oracle Research

Use this skill when prediction markets are being considered as a data source,
forecasting input, oracle-like signal, or decision-intelligence layer.

## Guardrails

- Do not treat market prices as objective truth.
- Do not provide investment advice or trading recommendations.
- Separate venue mechanics, liquidity, incentives, and resolution rules from the
  implied signal.
- Call out manipulation, thin liquidity, stale markets, and ambiguous outcomes.
- For an on-chain or execution-linked target, the initial PLAN should declare
  the exact URI
  `skill://ecc-skill-catalog/llm-trading-agent-security/SKILL.md` when that
  method is needed. If this loaded source is the first place that exposes it,
  Main may use the ordinary exact-URI RESOURCE EXTENSION before COMMIT. This
  research method neither grants write authority nor loads another Skill by
  itself.

## Research Workflow

1. Define the decision the signal is meant to inform.
2. Find relevant markets, events, tags, and venues.
3. Record market-implied probabilities with timestamps and source links.
4. Evaluate signal quality:
   - liquidity
   - spread
   - market age
   - trader/incentive concentration if known
   - resolution authority
   - geography or account restrictions
5. Compare against non-market sources such as filings, news, polls, research,
   customer data, or internal KPIs.
6. Recommend whether the signal is usable, weak, or unsuitable for the stated
   decision.

## Integration Patterns

- Research assistant: source-grounded context for a human analyst.
- Dashboard signal: market-implied probability alongside internal metrics.
- Agent memory input: a time-stamped signal that can be retrieved later.
- Alerting input: notify when probabilities, spreads, or liquidity cross a
  threshold.
- Scenario planning: compare multiple event outcomes without automating trades.

## Output Contract

Use:

1. decision context
2. market sources
3. signal quality
4. comparison sources
5. integration recommendation
6. caveats

End with:

```text
Prediction-market signals are informational inputs, not investment advice.
```
