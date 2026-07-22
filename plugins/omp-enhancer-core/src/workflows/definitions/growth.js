export const growthWorkflows = [
  {
    "id": "marketing.campaign",
    "chooseWhen": "An evidence-backed multi-channel campaign plan or content is requested for a defined product, audience, positioning, claims, and language.",
    "composeWith": [
      "research.web",
      "factcheck.document",
      "writing.zh",
      "writing.en",
      "writing.markdown",
      "slides.generate",
      "design.visual"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm the product, audience, decision, geography, channels, campaign stage, budget, timeline, output language, factual claims, deliverables, and publication boundary."
      },
      {
        "id": "step-2",
        "text": "Apply research.web and factcheck.document only when they were selected in PLAN for live evidence or claim verdicts, and record the distinction between fact and positioning inference."
      },
      {
        "id": "step-3",
        "text": "Define the source-backed audience insight, positioning, campaign angle, core benefit, message hierarchy, brand voice, channel purpose, and claim ledger before drafting copy."
      },
      {
        "id": "step-4",
        "text": "Apply the PLAN-selected writing.zh or writing.en method for the requested output language and create only the authorized channel deliverables."
      },
      {
        "id": "step-5",
        "text": "Check claim support, source freshness, language quality, channel fit, CTA correspondence, cross-channel consistency, accessibility, and visual needs before delivery."
      },
      {
        "id": "step-6",
        "text": "Deliver the bounded campaign artifacts, evidence and assumption notes, unresolved claim limitations, and explicit next actions without publishing them unless separately authorized."
      }
    ],
    "scopeNotes": [
      "The workflow owns campaign structure; task may own a complete bounded channel slice, but prefer exact domain roles inherited from the selected research, fact-check, writing, slide, or visual workflow.",
      "Content creation is not permission to send email, post to social platforms, buy ads, or publish a site."
    ],
    "skills": [
      "marketing-campaign",
      "market-research",
      "brand-voice"
    ],
    "catalogSkills": [
      "marketing-campaign",
      "market-research",
      "brand-voice"
    ],
    "qualityChecks": [
      "audience and product correspondence, fact and claim evidence, explicit inference, selected output language, language-matched writing review, channel-specific purpose, cross-channel consistency, supportable CTA, publication boundary, and residual uncertainty"
    ],
    "riskNotes": [
      "Unsupported claims, fabricated urgency, privacy-sensitive targeting, and unapproved publication can create legal and reputational harm."
    ],
    "roles": [
      "task"
    ],
    "delegation": [
      "steps-1-3: keep campaign scope, positioning, claim boundaries, and workflow composition with the parent",
      "steps-2-5: task owns one complete bounded channel deliverable and evidence slice only when no composed domain Agent is a closer match; a composed domain Agent is preferred when its workflow owns the requested research, fact-check, prose, slide, or visual method",
      "step-6: the parent reconciles facts, language, channel scope, artifacts, and publication boundaries"
    ]
  },
  {
    "id": "seo.audit",
    "chooseWhen": "An evidence-backed technical, on-page, structured-data, performance, or content-intent SEO audit is requested without implicit remediation.",
    "composeWith": [
      "research.web",
      "factcheck.document",
      "writing.zh",
      "writing.en",
      "design.visual"
    ],
    "steps": [
      {
        "id": "step-1",
        "text": "Confirm the site and revision, target market and language, important URLs, search intent, analytics and search-console evidence available, crawl boundary, and requested audit depth."
      },
      {
        "id": "step-2",
        "text": "Collect current crawl, indexability, canonical, redirect, sitemap, robots, metadata, heading, internal-link, structured-data, mobile render, and performance evidence from authorized sources."
      },
      {
        "id": "step-3",
        "text": "Map each finding to a concrete URL, source or render artifact, observed behavior, affected search or user intent, severity, and reproducible validation."
      },
      {
        "id": "step-4",
        "text": "Separate demonstrated technical defects from content hypotheses, keyword opportunities, third-party estimates, and recommendations that require live experiments."
      },
      {
        "id": "step-5",
        "text": "Deliver a prioritized audit with crawl and index evidence, current render and performance limitations, safe remediation order, and the workflows required for authorized code or prose changes."
      },
      {
        "id": "step-review",
        "text": "Reviewer independently audits the main-reviewed bounded diff and evidence without editing or mutating."
      }
    ],
    "scopeNotes": [
      "Main owns audit scope and final synthesis; task may own a complete bounded URL slice, but prefer exact domain roles from composed research, writing, or visual workflows when they match.",
      "SEO recommendations do not authorize site edits, deployment, analytics changes, outreach, or publication."
    ],
    "skills": [
      "seo",
      "benchmark"
    ],
    "catalogSkills": [
      "seo",
      "benchmark"
    ],
    "qualityChecks": [
      "crawl boundary, index and canonical evidence, URL-to-finding correspondence, current render evidence, structured-data correspondence, measured performance evidence, language and search-intent fit, prioritization rationale, and explicit limitations"
    ],
    "riskNotes": [
      "Search-engine behavior and third-party metrics change over time; label estimates and retrieve current primary evidence where material."
    ],
    "roles": [
      "task",
      "reviewer"
    ],
    "delegation": [
      "steps-1-4: task owns one complete bounded URL and evidence slice only when no composed domain Agent is a closer match; a composed domain Agent is preferred when its workflow owns the requested research, prose, or visual method",
      "step-5: the parent reconciles crawl, index, render, performance, language, and evidence limitations",
      "step-review: reviewer independently audits only the Main-reviewed bounded diff and evidence without project reads, commands, edits, or site changes; parent reconciles scope and conclusions"
    ]
  }
];
