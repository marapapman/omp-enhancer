---
name: deep-research
description: Multi-source deep research using currently exposed web search and page-reading methods. Synthesizes findings and delivers cited reports with source attribution when the user wants thorough research with evidence and citations.
origin: ECC
---

# Deep Research

When this Skill is listed in a `writer` or `zh-writer` assignment, it is
context only for that prose checkpoint. The writer consumes evidence already
supplied by Main and returns a proposal; it does not search the web, invoke
research tools, or issue independent research findings. Main or a separate
selected research Agent owns the research checkpoint.

> **Drift-prone skill.** Web tool names, quotas, and result shapes change.
> Inspect the current host-exposed methods and applicable official API docs
> before promising coverage or quoting live source counts.

Produce thorough, cited research reports from multiple web sources using the
currently exposed web search and page-reading methods. Firecrawl and Exa are
examples only when exposed by the host; they are not prerequisites.

## When to Activate

- User asks to research any topic in depth
- Competitive analysis, technology evaluation, or market sizing
- Due diligence on companies, investors, or technologies
- Any question requiring synthesis from multiple sources
- User says "research", "deep dive", "investigate", or "what's the current state of"

## Tool Availability

Use only search and page-reading tools currently exposed by the host. Named
Firecrawl or Exa calls below are optional examples only when those exact tools
are visible. Do not configure an MCP, edit host configuration, or install a
provider during the active task merely to satisfy this guide. Use the available
method and report concrete coverage limitations when a useful capability is
absent.

## Workflow

### Step 1: Understand the Goal

Ask 1-2 quick clarifying questions:
- "What's your goal — learning, making a decision, or writing something?"
- "Any specific angle or depth you want?"

If the user says "just research it" — skip ahead with reasonable defaults.

### Step 2: Plan the Research

Break the topic into 3-5 research sub-questions. Example:
- Topic: "Impact of AI on healthcare"
  - What are the main AI applications in healthcare today?
  - What clinical outcomes have been measured?
  - What are the regulatory challenges?
  - What companies are leading this space?
  - What's the market size and growth trajectory?

### Step 3: Execute Multi-Source Search

For each sub-question, search using the available host tools. If the exact
named examples are currently exposed, representative calls are:

**With firecrawl:**
```
firecrawl_search(query: "<sub-question keywords>", limit: 8)
```

**With exa:**
```
web_search_exa(query: "<sub-question keywords>", numResults: 8)
web_search_advanced_exa(query: "<keywords>", numResults: 5, startPublishedDate: "2025-01-01")
```

**Search strategy:**
- Start with the most direct query for each sub-question and add variants only when they cover a distinct synonym, source class, date range, geography, or unresolved evidence gap
- Mix general and news-focused queries
- Source count is not a quality target; stop when each material claim meets its planned evidence requirement or the remaining gap is explicit
- Apply a claim-specific freshness cutoff: current claims need current evidence, while historical and foundational claims may require the applicable original source rather than a newer summary
- Treat multiple pages that repeat one upstream dataset, press release, or analysis as one evidence lineage
- Prioritize: academic, official, reputable news > blogs > forums

### Step 4: Deep-Read Key Sources

For the most promising URLs, fetch full content with the current page-reading
method. The named calls below apply only when exposed:

**With firecrawl:**
```
firecrawl_scrape(url: "<url>")
```

**With exa:**
```
crawling_exa(url: "<url>", tokensNum: 5000)
```

Read enough key sources in full to satisfy the claim-level evidence plan. Do not rely only on search snippets, bibliographic metadata, provider labels, or landing-page identity records.

### Step 5: Synthesize and Write Report

Structure the report:

```markdown
# [Topic]: Research Report
*Generated: [date] | Sources: [N] | Confidence: [High/Medium/Low]*

## Executive Summary
[3-5 sentence overview of key findings]

## 1. [First Major Theme]
[Findings with inline citations]
- Key point ([Source Name](url))
- Supporting data ([Source Name](url))

## 2. [Second Major Theme]
...

## 3. [Third Major Theme]
...

## Key Takeaways
- [Actionable insight 1]
- [Actionable insight 2]
- [Actionable insight 3]

## Sources
1. [Title](url) — [one-line summary]
2. ...

## Methodology
Searched [N] queries across web and news. Analyzed [M] sources.
Sub-questions investigated: [list]
```

### Step 6: Deliver

- **Short topics**: Post the full report in chat.
- **Long reports**: Adapt the structure and length to the user request and
  deliver it in chat by default. Save a report only when the user requests a
  file and supplies or authorizes a safe path; otherwise keep delivery in chat.

## Delegated Research

For a broad topic, Main defines bounded sub-questions, evidence requirements, and
the source matrix before delegation. Consult the current dynamic Available Agents:
prefer a matching research Agent when one can own a complete
sub-question, otherwise use native `task`. Main chooses the Agent and fork width
from real independence, source overlap, available capacity, and cost; do not
manufacture a fixed fanout.

Send runnable independent sub-questions together and keep dependent follow-ups
for a later wave. Each assignment returns searched queries, sources read in
full, claim-level findings, confidence, and unresolved gaps. Main owns the
research plan, cross-reference pass, synthesis, citation verification, fallback
when delegation is unavailable or unsafe, and the final distinction between
fact and inference.

## Quality Rules

1. **Every claim needs a source.** No unsourced assertions.
2. **Cross-reference by need.** Follow each claim's predetermined corroboration requirement and count genuinely independent evidence lineages, not duplicated pages.
3. **Freshness is claim-specific.** Use the defined freshness cutoff for the claim, and do not replace an applicable original or historical authority with a merely newer summary.
4. **Acknowledge gaps.** If you couldn't find good info on a sub-question, say so.
5. **No hallucination.** If you don't know, say "insufficient data found."
6. **Separate fact from inference.** Label estimates, projections, and opinions clearly.

## Examples

```
"Research the current state of nuclear fusion energy"
"Deep dive into Rust vs Go for backend services in 2026"
"Research the best strategies for bootstrapping a SaaS business"
"What's happening with the US housing market right now?"
"Investigate the competitive landscape for AI code editors"
```
