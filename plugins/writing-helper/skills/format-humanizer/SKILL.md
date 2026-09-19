---
name: format-humanizer
description: "Remove AI writing traces — detect and replace structural AI tells, inflated phrasing, and chatbot residue while preserving meaning and voice"
---

# Format Humanizer

Scan a document for AI-generated writing patterns and produce authorized,
meaning-preserving replacements in one focused pass. Use one-at-a-time
confirmation only when the user explicitly requests interactive review or a
replacement would alter meaning.

This writer child is always proposal-only. Return the complete revised text,
using SEARCH/REPLACE blocks or a unified diff when a bounded patch is clearer.
Main retains permission decisions and actual file changes.

## Trigger

Use when the user asks to "humanize", "de-AI", "remove AI traces", "make this sound less AI", "fix the AI writing", or similar. Also when reviewing output that feels formulaic — symmetrical paragraphs, staged contrasts, padded introductions.

This skill covers English prose. For Chinese text use `zh-format-humanizer`; the pattern lists are language-specific and the catalogues do not substitute for each other.

## Why AI text sounds this way

A language model defaults to the most statistically likely phrasing for the widest audience, so ordinary facts come out generalized, hedged, and inflated. Vocabulary lists change with every model release; the structural habits below persist. Every pattern is one form of the same default choice, so fix the structure, not only the vocabulary.

Two rules follow. Every sentence kept must add something the reader did not already have. Any listed tell justifies an edit on its first sighting — prefer an over-correction to a miss. Only quotations, titles, proper names, passages discussing a phrase rather than using it, text predating November 30, 2022, and details that carry the writer's voice (specific unusual details, mixed feelings, first-person choices) are exempt.

## How to work

1. **Scan.** Read the whole document once and mark every tell, strongest patterns first. Look at paragraph shape, list shape, and headings, not only sentences: a contrast split across two sentences, three parallel examples, or the same closer after every section is the same tell at a larger scale.
2. **Draft the rewrite.** Keep every supported claim. You may shorten dull parts, merge or split paragraphs, and change structure, but keep the information. Do not add a fact, name, number, date, quote, or citation that is not in the source. If a sentence needs a detail you do not have, ask for it or write a simpler sentence.
3. **Check the draft.** Read it once and ask what still sounds machine-made, and whether the rewrite added or dropped any fact, number, date, quote, citation, or claim. Then search for the five tells that most often survive a rewrite: a not-X-but-Y contrast, a one-line closer, a dash, a triad, a bold label.
4. **Deliver.** State each point naturally instead of patching flagged phrases one at a time. Vary sentence length; real writing alternates short and long.

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

### Inflation and borrowed authority — keep the fact, drop the dressing

**§13 Overused AI words.** additionally, bolstered, crucial, delve, emphasizing, enduring, enhance, fostering, garner, highlight (verb), interplay, intricate, meticulous, pivotal, robust (figurative), showcase, tapestry, testament, underscore (verb), vibrant. This is the only vocabulary list in the skill; a formal word outside it is not a tell by itself, and a word's literal use stays.

**§14 Inflated significance.** "stands as a testament", "marks a pivotal moment", "plays a crucial role", "underscores its importance", "enduring legacy", and the stock "Challenges and Future Outlook" closing section ("Despite these challenges, ... continues to thrive"). Keep the fact and end on the last concrete point; if the source states real plans, use those.

**§15 Shallow -ing riders.** "..., highlighting...", "..., underscoring...", "..., reflecting...", "..., fostering..." tacked onto a simple fact. Keep the rider only when the source supports what it claims; attaching it to a named person does not make it true.

**§16 Sales language.** "boasts", "vibrant", "rich cultural heritage", "nestled", "in the heart of", "renowned", "breathtaking", "seamlessly", "commitment to". State what the thing is.

**§17 Borrowed authority.** "experts argue", "industry reports", "observers have cited", "some critics", and prestige outlet lists standing in for what was said. Use the named source and what it actually said; otherwise cut the unsupported claim or the list. Never invent a source. A missing citation alone is not a tell.

**§18 Vague connection.** "associated with", "linked to", "in connection with" where the relationship is not stated. Name the relationship the source gives; if the source does not say, keep the vague wording rather than inventing a role.

**§19 Copula avoidance.** "serves as", "stands as", "functions as", "boasts", "features" instead of is, are, has.

### Formatting by rule

**§20 Bold as decoration.** Words bolded without a reason, and vertical lists where every item is "**Bold label:** description". Remove the bold; turn a labeled list into prose when the labels carry no information of their own.

**§21 Decorative headings.** Title case on every heading, emoji or arrows on headings and list items, a horizontal rule between every section, a top-level heading that repeats the document title, headings that contain only other headings, and skipped heading levels. Use sentence case and let the title stand once.

**§22 Curly quotes.** "..." where the target format uses straight quotes. Most editors auto-curl, so this rarely changes meaning — still fix it when the format requires straight quotes.

### Leftovers from the chat and the draft — remove outright

**§23 Chatbot residue.** "I hope this helps", "Of course!", "Great question!", "You're absolutely right", "Would you like...", "Let me know". Remove the wrapper and keep the content.

**§24 Knowledge-limit disclaimers and guesses.** "as of my last update", "not widely documented", "based on available information, likely [X]". State what the source does not show, or cut the sentence. Never present a guess as a fact.

**§25 A heading repeated in the first sentence.** "## Performance" followed by "Speed matters." Delete the repeated sentence and start on the real content.

**§26 Writing about the previous version.** "This function was added to replace the old approach of..." belongs in change logs, release notes, and migration guides, not in documentation of current behavior.

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
