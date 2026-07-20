---
name: product-lens
description: Use this skill to validate the "why" before building, run product diagnostics, and pressure-test product direction before the request becomes an implementation contract.
origin: ECC
---

# Product Lens — Think Before You Build

This lane owns product diagnosis, not implementation-ready specification writing.

## OMP Composition Boundary

Main owns cross-Skill composition: it selects every supporting workflow and Skill
in the initial `WORKFLOW PLAN` and loads each declared Skill before
`WORKFLOW READY`. After load, this loaded Skill does not reselect, reroute,
auto-load, or hand off to another Skill. It does not replace the parent TODO or
Main's Agent choice. An exact same-namespace
`skill://ecc-skill-catalog/<skill-id>/SKILL.md` URI explicitly exposed here may be
read in one `RESOURCE EXTENSION` before `COMMIT`; cross-namespace candidates
remain initial-PLAN only.

A durable PRD-to-SRS or capability-contract artifact is outside this diagnostic
method. When independently requested, its non-routing PLAN candidate is
`skill://ecc-skill-catalog/product-capability/SKILL.md`.

## When to Use

- Before starting any feature — validate the "why"
- Weekly product review — are we building the right thing?
- When stuck choosing between features
- Before a launch — sanity check the user journey
- When converting a vague idea into a product brief before engineering planning starts

## How It Works

### Mode 1: Product Diagnostic

Like YC office hours but automated. Asks the hard questions:

```
1. Who is this for? (specific person, not "developers")
2. What's the pain? (quantify: how often, how bad, what do they do today?)
3. Why now? (what changed that makes this possible/necessary?)
4. What's the 10-star version? (if money/time were unlimited)
5. What's the MVP? (smallest thing that proves the thesis)
6. What's the anti-goal? (what are you explicitly NOT building?)
7. How do you know it's working? (metric, not vibes)
```

By default, return a concise chat report with answers, risks, and a go/no-go
recommendation. Write `PRODUCT-BRIEF.md` only when the user requests that
artifact and supplies or authorizes a safe path.

If the result is "yes, build this," report that disposition to Main; this loaded
Skill does not change lanes or dispatch implementation work.

### Mode 2: Founder Review

Reviews your current project through a founder lens:

```
1. Read README, CLAUDE.md, package.json, recent commits
2. Infer: what is this trying to be?
3. Score: product-market fit signals (0-10)
   - Usage growth trajectory
   - Retention indicators (repeat contributors, return users)
   - Revenue signals (pricing page, billing code, Stripe integration)
   - Competitive moat (what's hard to copy?)
4. Identify: the one thing that would 10x this
5. Flag: things you're building that don't matter
```

### Mode 3: User Journey Audit

Maps the actual user experience:

```
1. Review the existing checkout, supplied environment, or already available
   onboarding evidence as a new user. Clone or install only after the user
   explicitly authorizes that effect and an isolated target.
2. Document every friction point (confusing steps, errors, missing docs)
3. Time each step
4. Compare to competitor onboarding
5. Score: time-to-value (how long until the user gets their first win?)
6. Recommend: top 3 fixes for onboarding
```

### Mode 4: Feature Prioritization

When you have 10 ideas and need to pick 2:

```
1. List all candidate features
2. Score each on: impact (1-5) × confidence (1-5) ÷ effort (1-5)
3. Rank by ICE score
4. Apply constraints: runway, team size, dependencies
5. Output: prioritized roadmap with rationale
```

## Output

All modes produce an actionable chat report by default, not an essay. Every
recommendation has a specific next step. Write a durable artifact only when the
user requests it and authorizes its target.

## Non-Routing PLAN Candidates

Main may select these only when their independent selection conditions match:

- Journey verification: `skill://ecc-skill-catalog/browser-qa/SKILL.md`
- Visual-polish assessment: `skill://ecc-skill-catalog/design-system/SKILL.md`
- Post-launch monitoring: `skill://ecc-skill-catalog/canary-watch/SKILL.md`
- Implementation-ready capability planning: `skill://ecc-skill-catalog/product-capability/SKILL.md`
