---
name: santa-method
description: Run bounded independent adversarial review for high-risk factual, compliance, technical, or customer-facing output. Use when a deliverable benefits from evidence-backed dissent beyond the owning workflow's normal checks.
origin: "Ronald Skelton - Founder, RapportScore.ai"
---

# Santa Method

Use independent review to expose author bias. This is advisory review evidence,
not a generation workflow, runtime gate, or automatic repair loop.

## Scope

Use this method when factual accuracy, hallucination risk, compliance,
customer-facing quality, or cross-section consistency materially affects the
result. Prefer deterministic build, lint, test, schema, or citation checks when
they directly prove the property. Do not add review theater to routine drafts.

## 1. Freeze the review packet

Provide every reviewer the same bounded packet:

- original request and acceptance criteria;
- exact revision or artifact under review;
- authoritative source material and known evidence gaps;
- a rubric with observable pass conditions;
- requested output schema.

Do not pass another reviewer's conclusions. Context isolation matters more than
the number of reviewers.

## 2. Choose independent review adaptively

Main chooses the review lenses, Agent choice, and fork width from risk,
independence, current capacity, and the current dynamic Available Agents. Use a
matching domain Agent when visible; otherwise native `task` may own one complete
bounded review packet. A single strong independent review is better than
manufactured parallelism, while genuinely independent high-risk checks may run
in the same batch.

Useful lenses include:

- factual accuracy and source entailment;
- hallucination, fabricated entity, quote, URL, or API detection;
- requirement completeness and internal consistency;
- technical correctness and executable evidence;
- domain compliance, safety, accessibility, or brand constraints.

Main owns the review plan, assignment boundaries, integration, verification,
fallback when delegation is unavailable or unsafe, and the final response.

## 3. Return structured findings

Each independent review returns:

```json
{
  "checks": [
    {
      "criterion": "observable criterion",
      "result": "supported | concern | not-checked",
      "evidence": "exact source, artifact anchor, or command result",
      "impact": "what fails if the concern is valid"
    }
  ],
  "material_findings": [],
  "limitations": []
}
```

Do not turn a reviewer's confidence into proof. Deduplicate findings that share
one cause or evidence lineage, and preserve genuine disagreement.

## 4. Main finding disposition

Main validates every material finding against the current revision and records
a finding disposition: accepted, rejected with evidence, or unresolved. No review verdict grants permission to publish, deploy, or complete. Missing
review capacity is a reported limitation, not an instruction to invent a pass.

If an accepted finding is in scope, repair is a new bounded TODO checkpoint.
For code, send the repair to the owning native `task` and refresh affected
evidence. For other artifacts, use the matching currently available Agent when
safe. Review again only after a material revision, only for affected criteria,
and only when Main decides the additional evidence is proportionate. Never
redispatch unchanged input automatically.

## Batch Sampling

For a large homogeneous batch, choose a risk-based sample that includes edge
cases and high-impact items. Report the sampling rule and what remains
unchecked. A clean sample is evidence about the sample, not proof that every
item passed.

## Report

Return the reviewed revision, rubric, independent evidence, finding
dispositions, repairs and refreshed checks, unresolved disagreement, sampling
limits, and remaining risk.
