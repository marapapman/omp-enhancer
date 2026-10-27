---
name: format-humanizer
description: "Remove AI writing traces — detect and replace structural AI tells, inflated phrasing, and chatbot residue while preserving meaning and voice"
---

# Format Humanizer

Scan a document for AI-generated writing patterns and produce authorized,
meaning-preserving replacements. For substantial documents the rules are applied
one tell family at a time by independent tasks—never one mixed rewriting pass;
within one family the text is split into bounded chunks and each chunk is
revised by a fresh `writer` sub-task. Record the family inventory before any `writer` text-tool call changes prose.

All substantive English prose work—including initial writing or drafting,
substantive polishing or revision, translation, and logical revision—must be
performed through language-matched `writer` text-tool calls. This skill does not
authorize Main, `task`, or `checker` to write prose. The `writer` returns the
proposal first; an independent `checker` only reports logic, evidence,
semantic-drift, and clarity findings, including information-gain findings.
Any substantive repair returns to the same language-matched `writer`.

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

Two rules follow. First, information gain decides what stays. Every sentence must center on a stated point and keep only what supplies a new fact, a necessary qualifier, or a key logical relation. Do not re-explain what the reader can infer from context, pad with modifiers that add no information, or enumerate process mechanically for completeness. Reasonable omission is allowed so the reader completes a simple inference, and a revision deletes redundant expression first instead of restating it in more words. A focused sentence may carry several necessary clauses, so never delete a unique fact, number, unit, scope, condition, modality, negation, causal direction, citation, safety instruction, or reproducibility step to raise information gain, and never force needless explanation or uniformly short sentences onto the baseline's long linked sentences while each clause still informs. Apply the rule inside the revision order below — claims, evidence, and anchors decide what must stay, and information gain then decides how the wording is trimmed. Its sentence-level forms are §36, §37, and §38 in *Sentence-level information and scope*, and the scan covers them with the other families. The second rule: any listed tell justifies an edit on its first sighting — prefer an over-correction to a miss. Only quotations, titles, proper names, passages discussing a phrase rather than using it, text predating November 30, 2022, and details that carry the writer's voice (specific unusual details, mixed feelings, first-person choices) are exempt.

## Revision order

Every substantive pass uses this order: claims and evidence plus semantic anchors
first; logic and structure second; sentence and style polish last. Before any
replacement, record supported claims, evidence boundaries, qualifiers, modality,
scope, negation, numbers and units, citations, and causal direction. Settle
unsupported leaps, dependencies, and paragraph or heading order before changing
wording. Only then remove AI tells or polish sentences. Preserve every anchor;
do not add or drop a fact, source, citation, or limitation.

The order runs one tell family at a time in scan order, and the unit of each
`writer` call is one authorized chunk under the shared chunking contract: at
most 1,200 words or 6 slides, a fresh independent `writer` sub-task per chunk,
read-only adjacency context, and no resumed session or whole-document input.
The `writer` stays proposal-only; Main integrates the accepted proposals
verbatim into one current complete artifact, which is what the next family and
the checker read. The independent `checker` covers terminology and subject use,
repeated closers and page templatization, and style coverage across the
opening, middle, and closing chunks; it reports located findings and never
rewrites, and every wording repair returns to a new independent `writer`
sub-task for the affected chunk.

## How to work

One task owns one tell family. A substantial de-AI run is a chain of
single-family tasks, not one pass that applies every rule at once.

1. **Scan task.** Read the whole document once and produce a family
   inventory: which tell families actually appear, with one cited example
   each, strongest first. If the host exposes `writing_ai_scan`, use its
   distribution evidence (sentence rhythm, opening entropy, connective
   density, repeated n-grams, word-habit z-scores) to prioritize families;
   a keyword hit alone is not a verdict. Look at paragraph shape, list shape, and headings,
   not only sentences: a contrast split across two sentences, three parallel
   examples, or the same closer after every section is the same tell at a
   larger scale. The inventory covers the sentence-level families too: §36's
   re-emphasizing second half, consecutive emphasis, repeated explanation after
   a full explanation, and setup → emphasis → restatement; §37's unscoped
   quantifiers (all, any, only, always, never, every, must, exactly); and
   §38's anaphoric passive riders (a complete main clause plus a comma and a
   with + object + past participle + by + anaphoric actor adjunct), each
   entry cited with its sentence location and the scope evidence, so the
   sentence-level checks reach each chunk along with its other evidence.
   Families with no findings are skipped later.
2. **Per-family writer text-tool passes, strictly sequentially.** Main routes each
substantive family rewrite through language-matched `writer` text-tool calls in
scan order, and a later family receives the integrated version only after every
authorized chunk of the current family has returned and Main verifies each
pass's semantic-anchor check:
hedges, modality, scope, negation, causal direction, numbers, units, quotes, and
citations unchanged; no fact added or dropped. Inside one tell family the
non-overlapping chunks may run in parallel, each in a fresh `writer` sub-task;
each pass handles exactly one bounded chunk of that family (at most 1,200 words
or 6 slides) and reviews only its own range. Main integrates the returned
proposals mechanically by stable chunk id in document order, never by completion
order. Duplicated, out-of-range, stale-version, or truncated results never
overwrite the target: Main re-reads the affected chunk and schedules one bounded
repair for that chunk only. Each pass keeps every supported claim, may shorten
dull parts, merge or split paragraphs inside its chunk, and change structure
within its range without losing information. It must not add a fact, name,
number, date, quote, or citation that is not in the source. It returns
SEARCH/REPLACE blocks or a unified diff scoped to its family and chunk.
3. **Check inside each task.** Read the rewritten result once and ask what
   still sounds machine-made *for that family*, and whether the rewrite added
   or dropped any fact, number, date, quote, citation, or claim.
4. **Deliver.** The unit of each `writer` call stays one authorized chunk under
the shared chunking contract — bounded limits, a fresh independent sub-task,
proposal-only output. Main assembles the per-family writer proposals in
document order and integrates only accepted proposals verbatim into one
current complete artifact, the version later families and the checker read. An
independent `checker` only reports semantic, logic, evidence, and clarity
findings, including information-gain findings; it covers terminology and
subject use, repeated closers and page templatization, and style coverage
across the opening, middle, and closing chunks, locating each finding to its
chunk, and it never rewrites. Any substantive repair returns to the same
`writer` text tool as a new independent sub-task for the affected chunk.
Inside a chunk, minor edits keep the single pass only when the scan found
exactly one tell family; two or more families always go through the per-family
chain.

### Voice

If the user supplies a writing sample, match its sentence length, word choice, punctuation, openings, and transitions; the sample overrides §8, including its dash rate. Without a sample, take the voice from the kind of text: opinion and blog prose keep the writer's uncertainty, asides, and humor; reference and technical prose stays neutral and plain. Removing tells is half the job; the result must still sound like a person.

When the writer's built-in technical prose baseline is the active style, long information-dense sentences, formal technical vocabulary, first-person plural methods, explicit definitions followed by examples, and problem → approach framing are not AI tells by themselves; still flag the listed structures, unsupported significance, and copied citation markers.

## Pattern catalog

### Staging instead of stating — act on one sighting

**§1 Not X but Y.** "not just X, but Y", "it's not X, it's Y", "X rather than Y", the split form ("This does not mean X. It means Y."), and clipped negative tails ("..., no guessing"). The negative half names something nobody claimed, so the positive half sounds larger without adding a claim. State the point directly; keep a contrast only when the negative half corrects a belief the reader actually holds or both halves carry information.

**§2 One-line closers and dramatic fragments.** A one-sentence paragraph that restates the paragraph before it ("That is the real win.", "Let that sink in."), fragment rows ("No config. No agents. No drama."), and words set in ALL CAPS or period-separated. A short sentence may carry emphasis when it carries a new fact; cut a closer that only repeats, and merge fragment rows into a sentence with a specific claim.

**§3 Sayings that sound deep.** "the real question is", "at its core", "what really matters", "X is the Y of Z", "X is not a tool but a mirror". Replace the aphorism with the specific claim it dresses up.

**§3b Neat metaphor that tidies a complex concept.** A short, catchy analogy that compresses a mechanism into a tidy image ("X is the engine of Y", "X is a bridge", "think of X as Y") without saying where the analogy breaks. Keep a metaphor only when the assignment supplies it, it bears weight, and its limits are stated; otherwise replace it with the mechanism, conditions, and costs. A metaphor is not evidence.

**§4 Staged run-up.** "Let's dive in", "Here's what you need to know", "Let's be honest", "Look,", "Without further ado", "In this section, we will". Remove the run-up, not just its tone.

**§5 Arguing with no one.** "I'm not saying", "To be clear", "This isn't about", "Don't get me wrong", "A tempting approach would be", "Some might say... but". These answer objections that appear nowhere else in the text, usually left over from an earlier draft. Remove the defense; if it carries a real claim, state the claim.

### Rhythm by rule — edit on first sighting

**§6 Forced triads.** Adjective triplets ("clear, concise, and compelling") and three-part examples where the meaning has two parts or five. Check that each item adds a distinct idea; merge examples, develop the strongest one, or vary the structure. Keep three real items when the meaning needs three.

**§6b Parallelism and parallelism setup.** More than two clauses or items with the same syntactic shape, or a sentence that announces a list before delivering it ("three forces", "two things", "first ... second ... third ...", "not only ... but also ...", "both ... and ...", "from X to Y to Z"). Use parallelism only when every item is independently justified and the structure carries a real comparison; otherwise vary the syntax or state the items separately. A numbered setup with no real list is a tell.

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

**§30 Didactic cognition directives.** Cognition verbs with resultative
complements aimed at the reader or the text itself: "distinguish clearly",
"see clearly", "keep in mind", "remember that", "note this carefully",
"don't confuse X with Y", "let that sink in". Three forms: a command that
replaces the analysis (after "distinguish A from B" the text never actually
distinguishes them — delete the sentence and check whether its promise exists
elsewhere), a stamp certifying the text's own clarity ("this makes it clear",
"now the picture is complete", "you now understand"), and absolutizing
complements ("nailed down", "locked in", "settled for good") that turn a
negotiable state into an end state. Preaching register ("remember this",
"key takeaway") is chatbot residue leaking into prose; treat it as the same
family. State the distinction, the conclusion, or the analysis itself; when a
command precedes real analysis, delete the command and keep the analysis;
when expressing a fixed choice, give the concrete value or constraint and say
which parts remain adjustable. Exemptions: legitimate instructional registers
(step-by-step manuals, dialogue, interactive teaching), fixed technical terms
("hard-coded", "lock-free"), quotations, and proper names.

### Punctuation skeletons — act on one sighting

**§31 Claim-colon skeleton.** A colon splices a label or a short claim onto a sentence: "Latency: the cache cut it in half", "成本：降了三成", "Method: measure twice", and the caption "Left: input; Right: output". The colon makes a fragment read like a finding and leaves the subject, the verb, or the relation between the two halves for the reader to supply. Write the sentence directly ("The cache cut latency in half"). A colon is allowed only before an enumeration of three or more items, a definition, a formula, or code. Split captions carry the same skeleton: "Left: …; Right: …" becomes two complete sentences or one sentence that names the relation between the parts. Table headers are exempt.

### Document scale — count before you edit

The families below belong to the whole document, and the census and the rewrite
are separate steps. The scan task inventories §32–§35 over the whole document
and hands each chunk only its own evidence — the cited examples, the frame
numbers, and the keep/change positions Main derived from the count — so no
writer or checker has to ingest the whole document to revise one chunk. §32,
§33, and §34 are counted across every page, frame, or panel while the per-chunk
work stays bounded: each chunk edits only its own range under the shared
chunking contract, and each found instance is fixed when it is found. §35's
duplication between a table and its surrounding prose shows on the single page
that carries both, so it is judged on that page by the reader task stated in
§35 below, with neither the table nor the prose deleted by default; the
judgment decides which form stays and carries over the unique facts,
qualifiers, and citations. The whole deck still counts as one §35 round with no
added review round, executed chunk by chunk. All wording repair goes to the
same `writer` text tool as a new independent sub-task for one authorized
chunk. When a fix must move a fact or merge paragraphs across chunk boundaries,
Main forms a dependency group of just the affected units, withdraws their
independent write scope, and one new `writer` sub-task proposes a bounded
replacement covering both ends, never a whole-document rewrite. There is no
single all-family rewrite and no final whole-document polish pass.

**§32 Slide-scale uniformity.** A fixed page shape across a deck: the same bullet count on nearly every frame, the same sentence pattern inside each bullet, the same title length. Count the bullets per frame and the share taken by the most common count; when one count dominates, the template set the shape. The per-page bullet count follows that page's content, never a fixed three, and no page is padded to three. A deck where 131 of 144 bullet-bearing frames carry exactly three bullets has this tell.

**§33 Cross-slide refrain.** One claim or one phrase repeated verbatim across frames (a single sentence appearing on ten frames, or a group of six or more characters repeated on three or more). Write a definition in full once, allow it on a summary or index page at most once more, and replace the other occurrences with a new fact or delete them. Count repeated sentences of six or more characters across the deck and list each group with its frame numbers.

**§34 Caption echo.** The extension of §28 to captions and bullets. A caption that restates its frame's title or its bullets adds nothing to the figure, and a bullet that restates the title adds nothing to the page. Compare the caption, the title, and the bullet text by two-character shingles; a caption or bullet sharing half or more of its shingles with the title or with the bullets is an echo. Delete the echo, or replace it with what the figure or the page adds beyond the title and the bullets.

**§35 Table necessity and prose duplication.** A table earns its place on a page when it helps the reader compare, look something up, check a condition, or check a number; judge that question before touching wording, and never call a table useless from its row count, its column count, a single dimension, symmetric phrasing, or the number of tables on the page. When the prose and the table carry the same content, keep whichever form serves this page and move every unique fact, qualifier, number, citation, and safety note from the dropped form into the kept one; never default to protecting the table and deleting the prose. Same-page duplication is the defect itself, so prose that already covers the table's rows is never a reason to keep the table, and the table's shape is no reason to drop it; the page states the content in one form. Moving the unique information out of the removed form is required rather than the author's choice: approximation qualifiers such as "about" and "roughly", conditional qualifiers such as "when necessary", definitions, and judgments move into the form that stays before the other form goes. When the user limits the change to the table, prose outside the table is out of scope, and a sentence the material already carries is never deleted on the grounds that the writer sees no support for it; record it as an open verification item instead. Necessary explanation, reading conventions, premises, and teaching derivation are not redundancy and stay even when they add no new fact. Do not add conclusions such as "faster" or "stronger" to fill cells, and keep a table the user requested. A report cites the exact cell and the duplicated prose, states the reader task, the unique information, whether to keep the table, adjust it, or rewrite it as prose, and which technical statements need verification; a wording finding is never reported as a factual conclusion or an AI-authorship judgment. The census flags each frame that carries a sentence before or after a table; that flag marks a candidate, and the final judgment reads the full frame.

### Sentence-level information and scope — act on one sighting

**§36 Sentence-level restatement and emphasis.** Three shapes: a second half that only re-emphasizes or restates the first half, adding no new fact, necessary qualifier, or key logical relation; consecutive emphasis that stacks assertions or intensifiers on the same claim within one sentence or across adjacent sentences; and the setup → emphasis → restatement pattern, where one sentence sets up a claim, a second emphasizes it, and a third restates it in other words. Before: "The rollout cut error rates by nearly half, reducing errors dramatically." After: "The rollout cut error rates by nearly half." The fix: delete the re-emphasizing second half, cut the stacked emphasis, and keep the sentence that carries the fact; explain a concept fully once, then carry it forward with the term plus new facts, conditions, scope, method, or cost instead of another explanation. Exemptions: a second half that carries a necessary qualifier, a precondition, or genuinely new information stays, and the one place where a concept is explained in full is the explanation the text keeps.

**§37 Unscoped absolutes.** "all", "any", "only", "always", "never", "every", "must", and "exactly" each trigger a scope check against the evidence. Keep one only when the stated scope is present and matches the evidence; otherwise narrow or delete it and state the scope, the exception, or the untested case, so the sentence does not read as unjustified certainty. Before: "The parser handles any malformed input." After: "The parser handled every malformed input in the test corpus; malformed inputs outside that corpus were not tested." Exemptions: a measured claim whose stated scope matches the evidence, fixed technical terms ("exactly-once semantics", "all-pairs comparison"), quotations, and proper names.

**§38 Anaphoric passive riders.** A complete main clause followed by a comma and a `with` phrase in the shape with + object + past participle + by + an anaphoric actor; the `with` phrase is a participial adjunct, never a finite clause, and the rider carries the operation's second action behind an anaphoric actor. Before: "Documents and report.txt are joined into one path, with the separator added by it." After: "The function joins Documents and report.txt and adds the separator." The fix merges the rider's action and new object into the main clause; no deletion branch exists. Write the actor's name once only when it is recoverable from the main clause or earlier context; when it is not recoverable, keep the anaphor or split the rider into an independent sentence, and never invent an actor. §36 covers pure repetition, §18 covers shallow -ing riders, and §38 covers anaphoric passive riders carrying an action or a new object. Exemptions: independent sentences, explicit non-anaphoric actors, quotations, proper names, and code; no blanket exemption for interface documentation or technical passive voice. This is fixed whenever found, not clustering-gated.

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

3. **Revise.** Include safe replacements in the complete proposal for the chunk
   they belong to — the full revised text of that authorized chunk, and of the
   whole document only when the document is itself one chunk. Present only
   substantive decisions to the user; Main owns any authorized persistence and
   integrates the accepted proposals verbatim into the current complete
   artifact.

4. **Output comparison.** After a chunk's findings are processed, show:
   - **Before** — that chunk's original text
   - **After** — that chunk's revised text
   - **Changes** — count of replacements by pattern type
   Main reports whole-document totals from the integrated chunks; no call
   returns a whole-document rewrite for a substantial document.

## Optional Interactive Output

Use this format only when the user requested issue-by-issue confirmation:

For a substantial document, show this comparison per authorized chunk instead
of one whole-document pair.

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
