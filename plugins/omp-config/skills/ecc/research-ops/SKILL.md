---
name: research-ops
description: Evidence-first current-state research workflow for ECC. Use when the user wants fresh facts, comparisons, enrichment, or a recommendation built from current public evidence and any supplied local context.
origin: ECC
---

# Research Ops

When this Skill is listed in a `writer` or `zh-writer` assignment, it is
context only for that prose checkpoint. The writer consumes evidence already
supplied by Main and returns a proposal; it does not search the web, invoke
research tools, or issue independent research findings. Main or a separate
selected research Agent owns the research checkpoint.

Apply this method only after Main's visible `WORKFLOW PLAN` declares its exact Skill URI and Main loads it before `WORKFLOW READY`. This is a research method, not an orchestrator: it does not select, load, or dispatch any other Skill or Agent and never creates a second router.

Use the method when the user asks to research something current, compare options, enrich people or companies, or turn repeated lookups into a monitored workflow.

This is the operator wrapper around the repo's research stack. It is not a replacement for `deep-research`, `exa-search`, or `market-research`; it tells you when and how to use them together.

## Skill Stack

The following roles are compatibility hints, not instructions to load or dispatch anything. Apply a role only when Main already declared its exact URI, the current host exposes it, and it was loaded in the pre-READY resource batch:

- `exa-search` for fast current-web discovery
- `deep-research` for multi-source synthesis with citations
- `market-research` when the end result should be a recommendation or ranked decision
- `lead-intelligence` when the task is people/company targeting instead of generic research
- `knowledge-ops` when the result should be stored in durable context afterward

## When to Use

- user says "research", "look up", "compare", "who should I talk to", or "what's the latest"
- the answer depends on current public information
- the user already supplied evidence and wants it factored into a fresh recommendation
- the task may be recurring enough that it should become a monitor instead of a one-off lookup

## Guardrails

- do not answer current questions from stale memory when fresh search is cheap
- separate:
  - sourced fact
  - user-provided evidence
  - inference
  - recommendation
- do not spin up a heavyweight research pass if the answer is already in local code or docs

## Workflow

### 1. Start from what the user already gave you

Normalize any supplied material into:

- already-evidenced facts
- needs verification
- open questions

Do not restart the analysis from zero if the user already built part of the model.

### 2. Classify the research mode

Classify the evidence need before searching; this is not workflow, Skill, or Agent routing:

- quick factual answer
- comparison or decision memo
- lead/enrichment pass
- recurring monitoring candidate

### 3. Take the lightest useful evidence path first

Within the declared and loaded methods only:

- apply `exa-search` for fast discovery
- apply `deep-research` when synthesis or multiple sources matter
- apply `market-research` when the outcome should end in a recommendation
- apply `lead-intelligence` when the real ask is target ranking or warm-path discovery

### 4. Report with explicit evidence boundaries

For important claims, say whether they are:

- sourced facts
- user-supplied context
- inference
- recommendation

Freshness-sensitive answers should include concrete dates.

### 5. Decide whether the task should stay manual

If the user is likely to ask the same research question repeatedly, say so explicitly and recommend a monitoring or workflow layer instead of repeating the same manual search forever.

## Output Format

```text
QUESTION TYPE
- factual / comparison / enrichment / monitoring

EVIDENCE
- sourced facts
- user-provided context

INFERENCE
- what follows from the evidence

RECOMMENDATION
- answer or next move
- whether this should become a monitor
```

## Pitfalls

- do not mix inference into sourced facts without labeling it
- do not ignore user-provided evidence
- do not use a heavy research lane for a question local repo context can answer
- do not give freshness-sensitive answers without dates

## Verification

- important claims are labeled by evidence type
- freshness-sensitive outputs include dates
- the final recommendation matches the actual research mode used
