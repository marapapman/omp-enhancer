---
name: marketing-campaign
description: Marketing campaign domain method for audience research, positioning, channel selection, claim design, scoped content, calendars, and measurement. Use after Main selects a marketing workflow and only for campaign deliverables the user requests or authorizes; it does not own orchestration or publishing.
origin: ECC
---

# Marketing Campaign

When this Skill is listed in a `writer` or `zh-writer` assignment, it is
context only for that prose checkpoint. The writer consumes evidence already
supplied by Main and returns a proposal; it does not search the web, invoke
research tools, or issue independent research findings. Main or a separate
selected research Agent owns the research checkpoint.
In that writer assignment, Main or a separate selected campaign Agent owns
audience research, channel selection, and measurement planning.

Use this Skill as a domain method inside the workflow Main selected. Main owns workflow selection, orchestration, delegation, integration, and completion. This Skill does not auto-dispatch, retry, publish, or create a parallel orchestration layer.

## Scope and authority

- Produce only the deliverables the user explicitly requests or authorizes. There is no fixed full-campaign bundle or minimum deliverable count.
- Treat a requested end-to-end plan as permission to draft the in-scope artifacts, not as permission to mutate files, send messages, schedule posts, buy ads, change a live campaign, or publish.
- Every external effect requires explicit user authorization. A review verdict, stakeholder assumption, or loaded Skill does not supply that authorization.
- Review findings are advisory evidence. Main records their disposition; no finding or verdict grants completion or permission to ship.
- Use related Skills only when Main declared and loaded them. Their names below are candidates, not dispatch instructions.

## Campaign method

### 1. Establish scope and evidence

Record the campaign objective, product, target audience, market and time scope, requested channels, requested deliverables, allowed effects, and acceptance evidence. Separate sourced facts from user-provided assumptions and unresolved questions.

Run audience research before inventing language or fears. Examine jobs-to-be-done, desired outcomes, objections, alternatives, buying context, and the phrases the audience actually uses. Compare enough direct or adjacent competitors to identify positioning gaps without turning a competitor count into a completion condition.

### 2. Define positioning

Develop the smallest positioning set needed by the requested artifacts:

- a concrete benefit tied to the audience and outcome;
- the mechanism or credible reason to believe;
- a campaign angle based on a real tension or insight;
- a tone profile grounded in supplied brand evidence;
- a claim register containing each claim, its support, scope, time frame, and limitation.

Missing approval is not a hard stop. If the user asked for a complete draft and the uncertainty is safe to carry, state the working assumption and proceed. Surface a decision only when it materially changes the requested result or external effect.

### 3. Select channels and draft scoped content

Use only channels and artifact types that serve the stated objective. For each requested item, identify its audience stage, single purpose, core claim, supporting proof, call to action, and dependency on another item.

Adapt the message to the channel instead of resizing identical copy. Landing-page sections should preserve a clear problem, outcome, mechanism, proof, and next action when those sections are in scope. Email, social, ad, and video drafts should match their medium, audience state, and evidence. Do not invent urgency, testimonials, performance numbers, or product capabilities.

### 4. Build the calendar and measurement plan when requested

For a requested content calendar, map dates or relative timing, channel, artifact, dependency, owner when known, and status. Do not schedule or publish from the calendar without separate explicit authorization.

For measurement, connect each campaign objective to a metric, baseline when known, target or decision threshold, attribution window, instrumentation source, and review cadence. Mark missing telemetry and attribution limits instead of fabricating precision.

### 5. Review and report

Review the requested artifacts for:

- audience and positioning consistency;
- clarity of hero or opening copy;
- channel-native structure and tone;
- specific, earned calls to action;
- same-tuple support for factual and performance claims;
- cross-channel claim consistency;
- calendar dependencies and measurement coverage.

Return material issues, limitations, cheapest plausible counterchecks, and open decisions as advisory findings. Revise content only within the user's authorized deliverables and effect boundary.

## Writing heuristics

Prefer specific mechanisms and evidence over adjectives. Avoid hollow superlatives, generic landscape openings, fake urgency, unsupported social proof, bait-and-switch subjects, and generic calls to action. Follow an explicitly supplied brand voice when it conflicts with these defaults, except where doing so would create a false or unsupported claim.

## Optional related Skills

- `market-research` for audience and competitive evidence
- `brand-voice` for source-derived voice capture
- `content-engine` for platform-native content production
- `seo` for on-page search considerations
- `crosspost` only when distribution itself is explicitly requested and authorized
