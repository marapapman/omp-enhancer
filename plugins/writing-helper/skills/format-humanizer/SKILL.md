---
name: format-humanizer
description: "Remove AI writing traces — detect and replace structural AI tells, inflated phrasing, and chatbot residue while preserving meaning and voice"
---

# Format Humanizer

Scan a document for AI-generated writing patterns and produce authorized,
meaning-preserving replacements. For substantial documents the rules are applied
one tell family at a time by independent tasks—never one mixed rewriting pass.
Record the family inventory before any `writer` text-tool call changes prose.

All substantive English prose work—including initial writing or drafting,
substantive polishing or revision, translation, and logical revision—must be
performed through language-matched `writer` text-tool calls. This skill does not
authorize Main, `task`, or `checker` to write prose. The `writer` returns the
proposal first; an independent `checker` only reports logic, evidence, or
semantic-drift findings. Any substantive repair returns to the same
language-matched `writer`.

The `writer` text tool is always proposal-only. Return the complete revised text,
using SEARCH/REPLACE blocks or a unified diff when a bounded patch is clearer.
Main retains permission decisions and actual file changes and integrates only
the returned proposal verbatim. If a current permitted limitation prevents a safe
`writer` call, Main records the inability to call the text tool and must not
silently use another Agent or a direct writing fallback.

## Trigger

Use when the user asks to "humanize", "de-AI", "remove AI traces", "make this sound less AI", "fix the AI writing", or similar. Also when reviewing output that feels formulaic — symmetrical paragraphs, staged contrasts, padded introductions.

This skill covers English prose. For Chinese text use `zh-format-humanizer`; the pattern lists are language-specific and the catalogues do not substitute for each other.

## Why AI text sounds this way

A language model defaults to the most statistically likely phrasing for the widest audience, so ordinary facts come out generalized, hedged, and inflated. Vocabulary lists change with every model release; the structural habits below persist. Every pattern is one form of the same default choice, so fix the structure, not only the vocabulary.

Two rules follow. Every sentence kept must add something the reader did not already have. Any listed tell justifies an edit on its first sighting — prefer an over-correction to a miss. Only quotations, titles, proper names, passages discussing a phrase rather than using it, text predating November 30, 2022, and details that carry the writer's voice (specific unusual details, mixed feelings, first-person choices) are exempt.

## Revision order

Every substantive pass uses this order: claims and evidence plus semantic anchors
first; logic and structure second; sentence and style polish last. Before any
replacement, record supported claims, evidence boundaries, qualifiers, modality,
scope, negation, numbers and units, citations, and causal direction. Settle
unsupported leaps, dependencies, and paragraph or heading order before changing
wording. Only then remove AI tells or polish sentences. Preserve every anchor;
do not add or drop a fact, source, citation, or limitation.

## How to work

One task owns one tell family. A substantial de-AI run is a chain of
single-family tasks, not one pass that applies every rule at once.

1. **Scan task.** Read the whole document once and produce a family
   inventory: which tell families actually appear, with one cited example
   each, strongest first. Look at paragraph shape, list shape, and headings,
   not only sentences: a contrast split across two sentences, three parallel
   examples, or the same closer after every section is the same tell at a
   larger scale. Families with no findings are skipped later.
2. **Per-family writer text-tool passes, strictly sequentially.** Main routes each
substantive family rewrite through a language-matched `writer` text-tool call in
scan order. Call N+1 goes out only after call N returns and Main verifies its
semantic-anchor check:
hedges, modality, scope, negation, causal direction, numbers, units, quotes, and
citations unchanged; no fact added or dropped. Each writer text-tool pass handles
only its one
family on the full current text (which includes all earlier tasks' accepted edits),
keeps every supported claim, and may shorten dull parts, merge or split paragraphs,
and change structure without losing information. It must not add a fact, name,
number, date, quote, or citation that is not in the source. It returns
SEARCH/REPLACE blocks or a unified diff scoped to its family.
3. **Check inside each task.** Read the rewritten result once and ask what
   still sounds machine-made *for that family*, and whether the rewrite added
   or dropped any fact, number, date, quote, citation, or claim.
4. **Deliver.** Main assembles the per-family writer proposals in order and
integrates only accepted proposals verbatim. An independent `checker` only
reports semantic, logic, or evidence findings; it never rewrites. Any substantive
repair returns to the same `writer` text tool. Minor edits keep the single pass
only when
the scan found exactly one tell family; two or more families always go through
the per-family chain.

### Voice

If the user supplies a writing sample, match its sentence length, word choice, punctuation, openings, and transitions; the sample overrides §8, including its dash rate. Without a sample, take the voice from the kind of text: opinion and blog prose keep the writer's uncertainty, asides, and humor; reference and technical prose stays neutral and plain. Removing tells is half the job; the result must still sound like a person.

## Pattern catalog

### Staging instead of stating — act on one sighting

**§1 Not X but Y.** "not just X, but Y", "it's not X, it's Y", "X rather than Y", the split form ("This does not mean X. It means Y."), and clipped negative tails ("..., no guessing"). The negative half names something nobody claimed, so the positive half sounds larger without adding a claim. State the point directly; keep a contrast only when the negative half corrects a belief the reader actually holds or both halves carry information.

**§2 One-line closers and dramatic fragments.** A one-sentence paragraph that restates the paragraph before it ("That is the real win.", "Let that sink in."), fragment rows ("No config. No agents. No drama."), and words set in ALL CAPS or period-separated. A short sentence may carry emphasis when it carries a new fact; cut a closer that only repeats, and merge fragment rows into a sentence with a specific claim.

**§3 Sayings that sound deep.** "the real question is", "at its core", "what really matters", "X is the Y of Z", "X is not a tool but a mirror". Replace the aphorism with the specific claim it dresses up.

**§4 Staged run-up.** "Let's dive in", "Here's what you need to know", "Let's be honest", "Look,", "Without further ado", "In this section, we will". Remove the run-up, not just its tone.

**§5 Arguing with no one.** "I'm not saying", "To be clear", "This isn't about", "Don't get me wrong", "A tempting approach would be", "Some might say... but". These answer objections that appear nowhere else in the text, usually left over from an earlier draft. Remove the defense; if it carries a real claim, state the claim.

### Rhythm by rule — edit on first sighting

**§6 Forced triads.** Adjective triplets ("clear, concise, and compelling") and three-part examples where the meaning has two parts or five. Check that each item adds a distinct idea; merge examples, develop the strongest one, or vary the structure. Keep three real items when the meaning needs three.

**§7 Repeated sentence openings.** Several sentences in a row starting with the same subject, handled by rule instead of by ear. Merge the sentences, change the subject, or begin with the action. Do not ban the word; a remaining sentence may still start with "She".

**§8 Dashes as the universal connector.** Replace each dash with a period, comma, colon, or parentheses, or rewrite the sentence. This includes spaced dashes and double hyphens used as dashes. Leave dashes and hyphens inside code blocks, inline code, commands, paths, and URLs alone.

**§9 Stacked qualifiers.** "could potentially possibly", "might arguably", "in some cases it may". Keep a qualifier only when the source supports it and the meaning needs it; keep scope statements, legal and safety notices, and real corrections.

**§10 Hyphenated pairs everywhere.** "cross-functional", "data-driven", "end-to-end" hyphenated in every position. Keep the hyphen before a noun when grammar needs it ("a high-quality report") and drop it after the noun ("the report is high quality").

**§11 Passive voice and missing subjects.** "No configuration file needed. The results are preserved automatically." Use active voice when it makes the actor and action clearer.

**§12 Symmetrical paragraphs.** Every paragraph the same length and shape, with sentence 2 elaborating and sentence 3 transitioning, and no rhythm variation. Merge short adjacent paragraphs, rewrite identical openers, and vary sentence length.

**§13 Overused AI words.** Replace generic filler such as "delve", "landscape", "robust", "seamless", "crucial", or "significant" only when it adds no supported information. Keep the word when the source gives a concrete technical meaning or measured scope.

### Inflation and borrowed authority — keep the fact, drop the dressing

**§14 Inflated significance and hollow assertions.** "stands as a testament", "marks a pivotal moment", "plays a crucial role", "underscores its importance", "enduring legacy", and the stock "Challenges and Future Outlook" closing section ("Despite these challenges, ... continues to thrive"). Hollow assertions such as "this is important/significant/transformative" and "this demonstrates the power/value" are not evidence. Replace them with concrete facts, evidence, scope, or a stated limitation, or delete unsupported wording. Retain evidence-backed claims and state the support. Keep the fact and end on the last concrete point; if the source states real plans, use those.

**§15 Abstract-restatement echo.** A concrete fact followed by the same fact restated as a quoted or nominalized abstraction: "Counting rods and abacuses could add and subtract." then "“Being able to calculate” came early to humanity." Zero information gain — the second sentence repeats the first one level up, and the scare quotes around a commonplace fake depth. Delete the echo; replace it with a fact that advances the text.

**§16 Announcer transitions.** "The real question is ...", "A new question is ...", "This raises a deeper question ...", "But here is the deeper problem ...", and "This raises a new question ...". Do not announce on the reader's behalf which question matters next. Apply this ban to prose used in headings, body text, captions, notes, and labels; quotations, titles, proper names, and passages discussing the phrase remain exempt. Let the facts carry the transition, or state a concrete dependency ("Two obstacles remain at this point"). Replace the announcement with a concrete fact, evidence, scope, or limitation, or delete it.

**§17 Rhythm-matched paired-phrase closer.** Ending a sentence or paragraph with neatly matched phrases — "faster, cheaper, better", "whether it is fast enough, whether it can be automated" — unless every item is a real, independently justified dimension of the claim. Matched rhythm is earned by content, not composed for cadence; if one item can be cut without losing meaning, cut the whole flourish and state the single point.

**§18 Shallow -ing riders.** "..., highlighting...", "..., underscoring...", "..., reflecting...", "..., fostering..." tacked onto a simple fact. Keep the rider only when the source supports what it claims; attaching it to a named person does not make it true.

**§19 Sales language.** "boasts", "vibrant", "rich cultural heritage", "nestled", "in the heart of", "renowned", "breathtaking", "seamlessly", "commitment to". State what the thing is.

**§20 Borrowed authority.** "experts argue", "industry reports", "observers have cited", "some critics", and prestige outlet lists standing in for what was said. Use the named source and what it actually said; otherwise cut the unsupported claim or the list. Never invent a source. A missing citation alone is not a tell.

**§21 Vague connection.** "associated with", "linked to", "in connection with" where the relationship is not stated. Name the relationship the source gives; if the source does not say, keep the vague wording rather than inventing a role.

**§22 Copula avoidance.** "serves as", "stands as", "functions as", "boasts", "features" instead of is, are, has.

### Formatting by rule

**§23 Bold as decoration.** Words bolded without a reason, and vertical lists where every item is "**Bold label:** description". Remove the bold; turn a labeled list into prose when the labels carry no information of their own.

**§24 Decorative headings.** Title case on every heading, emoji or arrows on headings and list items, a horizontal rule between every section, a top-level heading that repeats the document title, headings that contain only other headings, and skipped heading levels. Use sentence case and let the title stand once.

**§25 Curly quotes.** "..." where the target format uses straight quotes. Most editors auto-curl, so this rarely changes meaning — still fix it when the format requires straight quotes.

### Leftovers from the chat and the draft — remove outright

**§26 Chatbot residue.** "I hope this helps", "Of course!", "Great question!", "You're absolutely right", "Would you like...", "Let me know". Remove the wrapper and keep the content.

**§27 Knowledge-limit disclaimers and guesses.** "as of my last update", "not widely documented", "based on available information, likely [X]". State what the source does not show, or cut the sentence. Never present a guess as a fact.

**§28 A heading repeated in the first sentence.** "## Performance" followed by "Speed matters." Delete the repeated sentence and start on the real content.

**§29 Writing about the previous version.** "This function was added to replace the old approach of..." belongs in change logs, release notes, and migration guides, not in documentation of current behavior.

## When not to act

Act on any listed tell at its first sighting; no listed tell above is clustering-gated. Leave a watched phrase alone inside a quotation, a title, a proper name, or a passage that discusses the phrase rather than uses it. Salutations and sign-offs on a letter predate chatbots. Text written before November 30, 2022 predates these tells. Keep the details that carry the writer's voice: a specific unusual detail, mixed feelings and unresolved tension, dated era-bound references, a first-person choice the writer can explain, and genuine asides or self-corrections.

## Preservation

Treat frequency and intensity qualifiers, modality, scope, negation, comparison and causal direction, numbers and units, citations and identifiers, and LaTeX math, cross-references, commands, and structure as semantic anchors. Preserve each anchor unless the user or evidence explicitly authorizes a change, and report any anchor the rewrite moved as an advisory finding instead of silently adjusting it.

## Process

1. **Scan.** Read the full document. Identify every instance of the patterns above. Collect into a list of findings with exact quotes.

2. **Assess findings.** For each finding, record:
   - Pattern name
   - Original text (with context, ~2 lines around if needed)
   - Suggested replacement
   - Whether it is a safe expression-only replacement or needs an author decision

3. **Revise.** Include safe replacements in the complete proposal. Present only
   substantive decisions to the user; Main owns any authorized persistence.

4. **Output comparison.** After all findings are processed, show:
   - **Before** — full original text
   - **After** — full revised text
   - **Changes** — count of replacements by pattern type

## Optional Interactive Output

Use this format only when the user requested issue-by-issue confirmation:

```
--- Finding 1 / N ---
Pattern: [pattern name]
Original: [exact quote with context]
Suggestion: [replacement text]
Replace? (y/n)
```

After all findings:

```
--- Before ---
[original full text]

--- After ---
[revised full text]

--- Changes ---
- staged contrasts: 3 replaced
- shallow -ing riders: 2 replaced
- inflated significance: 1 replaced
...etc
```

## Source

The pattern taxonomy is adapted from Wikipedia's ["Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), maintained by WikiProject AI Cleanup, and from the pattern grouping and strength doctrine of [blader/humanizer](https://github.com/blader/humanizer) (MIT). The wording and examples in this Skill are original to this repository; both sources describe the same structural tells, and neither is quoted at length here.
