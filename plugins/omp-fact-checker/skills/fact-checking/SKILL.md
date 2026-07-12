---
name: fact-checking
description: Plan, evidence, cross-check, and review workflow for factual claim verification.
---

# Fact Checking Workflow

Use this skill when checking whether prose, reports, papers, public claims, citations, statistics, or time-sensitive statements are factually supported.

Principles:

- Do not rely on model memory for final factual verdicts.
- Split broad statements into atomic claims.
- Prefer primary or authoritative sources.
- Treat unavailable evidence as `INSUFFICIENT`, not as false.
- Keep source date and retrieval context when facts may change.
- Use independent evidence lanes for medium and high-risk tasks.

Recommended workflow (adapt it to the task and available evidence):

1. Produce `FACT_CHECK_PLAN`.
2. Collect `FACT_EVIDENCE_A`.
3. Collect independent `FACT_EVIDENCE_B` for medium/high-risk or multi-claim checks.
4. Produce `FACT_CROSS_CHECK`.
5. Produce `FACT_REVIEW`.
6. Final answer includes `FACT_CHECK_REPORT` and `FACT_CHECK_USAGE`.

Optional workflow summary:

FACT_CHECK_USAGE
Recommended stages:
- FACT_CHECK_PLAN
- FACT_EVIDENCE_A
- FACT_EVIDENCE_B or CROSS_CHECK_DEGRADED
- FACT_CROSS_CHECK
- FACT_REVIEW
Completed stages:
- ...
