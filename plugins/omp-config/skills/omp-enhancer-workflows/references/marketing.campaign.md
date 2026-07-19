# `marketing.campaign` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `marketing.campaign`

- Primary when: The user wants an evidence-backed multi-channel campaign plan or campaign content tied to a product, audience, positioning, claims, language, and review process.
- Reference steps:
  1. [step-1] Confirm the product, audience, decision, geography, channels, campaign stage, budget, timeline, output language, factual claims, deliverables, and publication boundary.
  2. [step-2] Apply research.web and factcheck.document only when they were selected in PLAN for live evidence or claim verdicts, and record the distinction between fact and positioning inference.
  3. [step-3] Define the source-backed audience insight, positioning, campaign angle, core benefit, message hierarchy, brand voice, channel purpose, and claim ledger before drafting copy.
  4. [step-4] Apply the PLAN-selected writing.zh or writing.en method for the requested output language and create only the authorized channel deliverables.
  5. [step-5] Check claim support, source freshness, language quality, channel fit, CTA correspondence, cross-channel consistency, accessibility, and visual needs before delivery.
  6. [step-6] Deliver the bounded campaign artifacts, evidence and assumption notes, unresolved claim limitations, and explicit next actions without publishing them unless separately authorized.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - steps-1-3: keep campaign scope, positioning, claim boundaries, and workflow composition with the parent
  - steps-2-5: use only exact roles inherited from composed research.web, factcheck.document, writing.zh, writing.en, slides.generate, or design.visual workflows
  - step-6: the parent reconciles facts, language, channel scope, artifacts, and publication boundaries
- Quality checks:
  - audience and product correspondence, fact and claim evidence, explicit inference, selected output language, language-matched writing review, channel-specific purpose, cross-channel consistency, supportable CTA, publication boundary, and residual uncertainty
- Scope notes:
  - The workflow owns campaign structure but has no language-neutral marketing Agent; use exact roles inherited from the selected research, fact-check, writing, slide, or visual workflow.
  - Content creation is not permission to send email, post to social platforms, buy ads, or publish a site.
- Risk notes:
  - Unsupported claims, fabricated urgency, privacy-sensitive targeting, and unapproved publication can create legal and reputational harm.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
