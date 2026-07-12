# OMP Fact Checker

Fact-checking workflow plugin for OMP. It extracts factual claims, collects evidence, compares independent evidence lanes, and provides an advisory completeness review.

The workflow is designed for low user interruption:

- small low-risk checks may use one evidence lane plus review;
- ordinary fact-checking uses two independent evidence lanes;
- high-risk domains benefit from planner, two researchers, cross-checker, and reviewer evidence;
- missing network/API access is reported as insufficient evidence instead of repeated blocking.

## Tools

- `fact_check_analyze` extracts claim candidates and builds a `FACT_CHECK_PLAN`.
- `fact_check_evidence` collects local or provider evidence for claims.
- `fact_check_report` summarizes verdicts into `FACT_CHECK_REPORT`.
- `fact_check_gate` is a compatibility name for a non-blocking workflow completeness review. Missing evidence is returned as findings, never as a session gate.

The plugin does not block tools, retry work automatically, or prevent session completion. Invalid parameters and real file/network execution errors still use normal error results.

## Agents

- `fact-planner`
- `fact-researcher-a`
- `fact-researcher-b`
- `fact-cross-checker`
- `fact-reviewer`

Model policy:

- `fact-planner` declares `pi/plan` then `pi/slow` so claim decomposition is not forced onto the generic task model.
- `fact-cross-checker` and `fact-reviewer` declare `pi/slow` for high-signal review of evidence conflicts and final verdicts.
- `fact-researcher-a` and `fact-researcher-b` stay on the active task/default subagent model for evidence collection.
