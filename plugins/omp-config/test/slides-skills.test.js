import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const slidesSkillUrl = new URL('../skills/latex-beamer-slides/SKILL.md', import.meta.url);
const storylineSkillUrl = new URL('../skills/slides-storyline/SKILL.md', import.meta.url);
const conversionSkillUrl = new URL('../skills/beamer-to-powerpoint/SKILL.md', import.meta.url);
const qualityReferenceUrl = new URL('../skills/latex-beamer-slides/references/beamer-quality.md', import.meta.url);
const definitionsUrl = new URL('../../../scripts/workflow-definitions.js', import.meta.url);

test('Beamer generation checks the template before committing a story and authoring frames', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const generation = markdownSection(skill, 'Generate a new deck');

  const inspectTemplate = generation.indexOf('Inspect template readiness');
  const discussTemplate = generation.indexOf('If the template is not configured');
  const discussStory = generation.indexOf('apply the PLAN-loaded `slides-storyline`');
  const generateFrames = generation.toLowerCase().indexOf('generate the deck from the committed template and outline');
  const renderQa = generation.indexOf('Have `task` compile with the native engine');
  const visualPrecheck = generation.indexOf('single read-only visual precheck');
  const taskLayout = generation.indexOf('Have `task` perform the final layout pass');
  const freshRerender = generation.indexOf('Have `task` recompile and render that exact layout revision');
  const visualReview = generation.indexOf('Perform the single read-only visual review of the latest rendered pages');
  assert.ok(inspectTemplate >= 0);
  assert.ok(inspectTemplate < discussTemplate);
  assert.ok(discussTemplate < discussStory);
  assert.ok(discussStory < generateFrames);
  assert.ok(generateFrames < renderQa);
  assert.ok(visualPrecheck >= 0);
  assert.ok(renderQa < visualPrecheck);
  assert.ok(visualPrecheck < taskLayout);
  assert.ok(taskLayout < freshRerender);
  assert.ok(freshRerender < visualReview);
  assert.ok(taskLayout < visualReview);
  assert.match(generation, /visual character, logo or explicit no-logo choice, aspect ratio, fonts, colors/i);
  assert.match(generation, /ask the user only when a missing choice materially changes the deck/i);
  assert.match(generation, /only files carrying that marker/i);
  assert.match(generation, /fresh renders of every page.+overview or contact sheet/is);
  assert.match(generation, /revision identifier.+PDF.+render directory/is);
  assert.match(generation, /committed outline.+output language.+semantic anchors.+LaTeX structure/is);
  assert.match(generation, /text and image overlap.+crowding.+clipping.+undersized text/is);
  assert.match(generation, /exactly one owner—Main, or a task that did not produce the revision/i);
  assert.match(generation, /Record advisory findings only/i);
  assert.match(generation, /supported finding.+`task` applies the bounded layout-only source revision.+(?:the review owner|reviews only fresh rerendered evidence).+at most once/is);
  assert.match(generation, /Main only authorizes external effects during initial setup and accepts final delivery.+does not compile, render, modify, reconcile, or mediate the visual loop/is);
  assert.match(generation, /No review finding grants permission to convert, publish, or complete/i);
});

test('Beamer uses one advisory current-revision precheck before each task layout pass', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const paths = [
    markdownSection(skill, 'Generate a new deck'),
    markdownSection(skill, 'Modify an existing deck'),
  ];

  for (const path of paths) {
    const precheckStart = path.indexOf('Perform the single read-only visual precheck');
    const taskLayoutStart = path.indexOf('Have `task` perform', precheckStart);
    assert.ok(precheckStart >= 0);
    assert.ok(taskLayoutStart > precheckStart);

    const precheck = path.slice(precheckStart, taskLayoutStart);
    assert.match(precheck, /exactly one owner.+`task` or Main.+chosen by Main.+completed the artifact.+native visual input/is);
    assert.match(precheck, /same current revision/is);
    assert.match(precheck, /read-only/is);
    assert.match(precheck, /advisory findings.+page.+region.+criterion.+evidence.+impact.+limitations/is);
  }

  assert.equal((skill.match(/single read-only visual precheck/gi) ?? []).length, 2);
  assert.match(skill, /read-only inspection.+does not grant.+compile, render, edit, or reconcile ownership/is);
  assert.doesNotMatch(skill, /parallel|dual|async|disagreement|findings merge|fallback/i);
});

test('Beamer dependencies stay inside staged PLAN and LOAD before READY', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const timing = markdownSection(skill, 'Stage dependent Skills before READY');
  const generation = markdownSection(skill, 'Generate a new deck');

  assert.match(timing, /WORKFLOW PLAN.+declare.+exact Skill URIs/is);
  assert.match(
    timing,
    /language Skills.+`latex-beamer-slides`.+`slides-storyline`.+`beamer-to-powerpoint`.+workflow references/is,
  );
  assert.match(timing, /wait for every declared resource result.+before `WORKFLOW READY`/is);
  assert.match(timing, /not visible.+skills-unavailable|unavailable.+skills-unavailable/is);
  assert.match(timing, /After `WORKFLOW READY`.+do not.+(?:Skill read|PLAN \+ LOAD)/is);
  assert.match(
    timing,
    /RESOURCE EXTENSION \| source=skill:\/\/latex-beamer-slides \| reads=skill:\/\/latex-beamer-slides\/references\/beamer-quality\.md/iu,
  );
  assert.match(timing, /this loaded Skill.+exact URI.+before.+workflow references/isu);
  assert.match(generation, /Apply the PLAN-loaded `slides-storyline`/i);
  assert.match(generation, /Apply the PLAN-loaded `beamer-to-powerpoint`/i);
  assert.doesNotMatch(generation, /\bload `(?:slides-storyline|beamer-to-powerpoint)`/i);
});

test('Beamer modification stays bounded to language and existing style', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const modification = markdownSection(skill, 'Modify an existing deck');

  const initialRender = modification.indexOf('Have `task` compile and render the affected deck');
  const precheck = modification.indexOf('single read-only visual precheck');
  const taskLayout = modification.indexOf('Have `task` perform a final layout pass');
  const freshRerender = modification.indexOf('Have `task` recompile and render that exact layout revision');
  const visualReview = modification.indexOf('Perform the single read-only visual review of the latest renders');
  assert.ok(initialRender >= 0);
  assert.ok(precheck > initialRender);
  assert.ok(taskLayout > precheck);
  assert.ok(freshRerender > taskLayout);
  assert.ok(visualReview > freshRerender);
  assert.match(modification, /wording, language-norm, and existing-style changes/i);
  assert.match(modification, /preserve the story arc, frame order, template, logo, layout system/i);
  assert.match(modification, /Do not redesign the template or reopen story planning/i);
  assert.match(modification, /Do not require template discussion or a story-outline checkpoint/i);
  assert.match(modification, /Have `task` perform a final layout pass on the changed frames and any pages whose layout they can influence/i);
  assert.match(modification, /Have `task` recompile and render that exact layout revision.+revision identifier.+PDF.+render directory/is);
  assert.match(modification, /Perform the single read-only visual review of the latest renders/i);
  assert.match(modification, /text and image overlap.+crowding.+clipping.+undersized text/is);
  assert.match(modification, /exactly one owner—Main, or a task that did not produce the revision/i);
  assert.match(modification, /Record advisory findings only/i);
  assert.match(modification, /supported finding.+`task` applies the bounded source revision.+(?:the review owner|reviews only fresh rerendered evidence).+at most once/is);
  assert.match(modification, /Main only authorizes external effects during initial setup and accepts final delivery.+does not compile, render, modify, reconcile, or mediate the visual loop/is);
  assert.match(modification, /Do not widen the edit to unrelated pre-existing layout defects/i);
  assert.match(modification, /Do not split, add, remove, or reorder frames without explicit user authorization/i);
  assert.match(skill, /choose Chinese or English writing skills from the body being changed, not from the instruction language/i);
  assert.match(skill, /`plain-chinese-writing`/);
  assert.match(skill, /`writing-review`/);
});

test('slides storyline defines a text-only per-page confirmation phase', async () => {
  const skill = await readFile(storylineSkillUrl, 'utf8');

  assert.match(skill, /audience, purpose, setting, duration or target slide count, output language/i);
  assert.match(skill, /Do not invent examples, citations, numbers, results, or quotations/i);
  assert.match(skill, /Present a numbered outline/i);
  assert.match(skill, /text-only page draft/i);
  assert.match(skill, /page by page|one page at a time/i);
  assert.match(skill, /complete natural-language sentences or paragraphs/i);
  assert.match(skill, /user confirmation.+before visual authoring/is);
  assert.match(skill, /REQUIRED conversational checkpoint/);
  assert.match(skill, /plain-chinese-writing/i);
  assert.match(skill, /zh-format-humanizer/i);
  assert.match(skill, /ask only when a missing choice materially changes the deck/i);
  assert.match(skill, /explicit assumptions/i);
  assert.match(skill, /Do not use for ordinary edits to an existing deck/i);
});

test('new Beamer keeps the confirmed Markdown plan as the canonical content source', async () => {
  const [storyline, beamer, quality] = await Promise.all([
    readFile(storylineSkillUrl, 'utf8'),
    readFile(slidesSkillUrl, 'utf8'),
    readFile(qualityReferenceUrl, 'utf8'),
  ]);

  assert.match(storyline, /write the text-only page draft to a Markdown content-plan file/i);
  assert.match(storyline, /Markdown content plan is the canonical content source/i);
  assert.match(storyline, /do not create or edit Beamer .tex frames during this stage/i);
  assert.match(storyline, /content changes.+edit the Markdown.+reconfirm.+regenerate.+Beamer/is);
  assert.doesNotMatch(storyline, /Do not write a storyline file unless the user requests one/i);

  assert.match(beamer, /create or update a Markdown content-plan file/i);
  assert.match(beamer, /translate the confirmed Markdown content plan into Beamer frames and then perform layout/i);
  assert.match(beamer, /sole content source/i);
  assert.match(beamer, /do not rewrite, shorten, or add content in .tex/i);
  assert.match(beamer, /return to the Markdown content stage.+reconfirm.+regenerate/is);
  assert.doesNotMatch(beamer, /Shorten or condense text only to fit/i);

  assert.match(quality, /Markdown content plan is the canonical content source/i);
  assert.match(quality, /do not rewrite, shorten, or add content in .tex/i);
  assert.match(quality, /return to the Markdown content stage.+reconfirm.+regenerate/is);
});

test('slides storyline starts technical decks with a provisional six-part scaffold', async () => {
  const skill = await readFile(storylineSkillUrl, 'utf8');
  const briefStart = skill.indexOf('## Establish the brief');
  const scaffoldStart = skill.indexOf('## Provisional technical story scaffold');
  const shapeStart = skill.indexOf('## Shape the story');
  const scaffold = markdownSection(skill, 'Provisional technical story scaffold');
  const labels = [
    'Background',
    'Existing limitations',
    'Core idea',
    'Concrete technical method',
    'Technical experimental effects',
    'System deployment effects',
  ];

  assert.ok(briefStart >= 0);
  assert.ok(scaffoldStart > briefStart);
  assert.ok(shapeStart > scaffoldStart);
  let previous = -1;
  for (const label of labels) {
    const position = scaffold.indexOf(label);
    assert.ok(position > previous, `missing or out-of-order scaffold item: ${label}`);
    previous = position;
  }
  assert.match(scaffold, /provisional.+starting scaffold.+adapt or replace.+user/is);
  assert.match(scaffold, /existing limitations.+tension|core idea.+explanation.+evidence/is);
  assert.match(scaffold, /discuss.+user.+specific framework.+content outline/is);
  assert.match(scaffold, /adapt|split|merge|reorder/i);
  assert.doesNotMatch(scaffold, /fixed outline|mandatory order|must use this exact order/i);
});

test('new Beamer work stages text confirmation before visual authoring and layout refinement', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const generation = markdownSection(skill, 'Generate a new deck');
  const textStage = generation.indexOf('Phase 1: Text-only content');
  const visualStage = generation.indexOf('Phase 2: Visual authoring');
  const baseLayout = generation.indexOf('Confirm the basic layout');
  const refinement = generation.indexOf('existing visual review and refinement path');

  assert.ok(textStage >= 0);
  assert.ok(visualStage > textStage);
  assert.ok(baseLayout > visualStage);
  assert.ok(refinement > baseLayout);
  assert.match(generation, /section-sized batches.+each page.+complete.+sentences or paragraphs/is);
  assert.match(generation, /discuss.+page by page.+wait for the user.+confirmation/is);
  assert.match(generation, /do not.+(?:add images|perform layout|author visuals).+before.+confirmation/is);
  assert.match(generation, /for every page.+(?:select|create|place).+visual/i);
  assert.match(generation, /shorten|condense|精简/i);
  assert.match(generation, /never convert.+(?:phrases|keywords).+body text/is);
  assert.match(generation, /Confirm the basic layout.+before.+refinement/is);
  assert.match(skill, /REQUIRED conversational checkpoint/);
  assert.match(generation, /existing visual review and refinement path.+advisory/is);
});



test('Beamer visual review is advisory and never an automatic repair controller', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');

  assert.match(skill, /Agent availability and capacity remain Main decisions/i);
  assert.match(skill, /No review finding grants permission to convert, publish, or complete/i);
  assert.doesNotMatch(skill, /designer/i);
});

test('PowerPoint conversion uses only a user-supplied command and verifies the artifact', async () => {
  const skill = await readFile(conversionSkillUrl, 'utf8');

  assert.match(skill, /exact conversion command supplied by the user/i);
  assert.match(skill, /do not select or invent a converter/i);
  assert.match(skill, /Check first whether the user provided a concrete conversion command/i);
  assert.match(skill, /If the command is missing, ask for the exact command/i);
  assert.match(skill, /Do not start conversion planning, request optional source assets, or suggest that extra files will make the result editable/i);
  assert.match(skill, /Do not substitute LibreOffice, Pandoc, an online service, or another converter by default/i);
  assert.match(skill, /ZIP container is readable and includes the core PowerPoint package entries/i);
  assert.match(skill, /Distinguish container validity from visual fidelity and editability/i);
  assert.doesNotMatch(skill, /retry until|repeat until|block:\s*true|continue:\s*true/i);
});

test('Beamer quality reference covers compile and rendered-slide evidence', async () => {
  const reference = await readFile(qualityReferenceUrl, 'utf8');

  assert.match(reference, /compile smoke succeeds/i);
  assert.match(reference, /overfull boxes/i);
  assert.match(reference, /missing characters or glyphs/i);
  assert.match(reference, /Render every PDF page to an image/i);
  assert.match(reference, /no page is blank or nearly blank unless intentional/i);
  assert.match(reference, /full-resolution page renders.+overview or contact sheet/is);
  assert.match(reference, /text and image overlap/i);
  assert.match(reference, /cramped composition/i);
  assert.match(reference, /cropped or distorted image/i);
  assert.match(reference, /Do not report visual QA from compilation alone/i);
  assert.match(reference, /single read-only visual precheck/i);
  assert.match(reference, /same current revision.+advisory findings.+page.+region.+criterion.+evidence.+impact.+limitations/is);
  assert.match(reference, /does not grant.+compile, render, edit, or reconcile ownership/is);
  assert.doesNotMatch(reference, /parallel|dual|async|disagreement|findings merge|fallback/i);
  assert.match(reference, /text-only page draft.+section-sized batches.+complete natural-language sentences or paragraphs/is);
  assert.match(reference, /Do not replace.+isolated phrases.+keyword strings.+phrase-only bullet lists/is);
  assert.match(reference, /Chinese slide text.+plain-chinese-writing.+zh-format-humanizer.+zh-writing-review/is);
  assert.match(reference, /basic layout.+user.+confirmation.+before.+refinement/is);
  assert.match(reference, /REQUIRED conversational checkpoint/);
  assert.match(reference, /multiple explicit.+refinement rounds|current multi-pass.+visual evidence/is);
});

test('Beamer skill supplies layout specialization with a read-only visual review', async () => {
  const slidesSkill = await readFile(slidesSkillUrl, 'utf8');

  assert.match(slidesSkill, /Have `task` perform the final layout pass/i);
  assert.match(slidesSkill, /overlap, crowding, clipping, undersized text, cropped or distorted figures/is);
  assert.match(slidesSkill, /Do not split, add, remove, or reorder frames without explicit user authorization/i);
});

test('Beamer generation reconciles slide order between text confirmation and visual authoring', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const generation = markdownSection(skill, 'Generate a new deck');

  const textStage = generation.indexOf('Phase 1: Text-only content');
  const orderStage = generation.indexOf('Slide-order reconciliation');
  const visualStage = generation.indexOf('Phase 2: Visual authoring');

  assert.ok(textStage >= 0);
  assert.ok(orderStage > textStage);
  assert.ok(visualStage > orderStage);
  assert.match(generation, /separate `task` to adjust the slide order on the Markdown content plan/is);
  assert.match(generation, /content overlap between slides/is);
  assert.match(generation, /semantically coherent with one main job per slide/is);
  assert.match(generation, /logical progression from context to conclusion/is);
  assert.match(generation, /no page title uses the "XX：XX" two-part label pattern/is);
  assert.match(generation, /reading all page titles in deck order forms a coherent, grammatical narrative/is);
  assert.match(generation, /Title and body violations are content findings that return to the Markdown content plan with the user, never \.tex edits/is);
  assert.match(generation, /proposed reordering with per-move justification/is);
  assert.match(generation, /Never reorder frames by editing \.tex directly/is);
  assert.match(generation, /Only after the slide order is reconciled, generate the deck/is);
});

test('slides storyline defines the slide-order reconciliation stage', async () => {
  const skill = await readFile(storylineSkillUrl, 'utf8');
  const reconciliation = markdownSection(skill, 'Slide-order reconciliation');

  assert.match(reconciliation, /separate `task` to reconcile the slide order on the Markdown content plan/is);
  assert.match(reconciliation, /content overlap between slides/is);
  assert.match(reconciliation, /every slide keeps one main job/is);
  assert.match(reconciliation, /no page title uses the "XX：XX" two-part label pattern/is);
  assert.match(reconciliation, /reading all titles in deck order forms a coherent, grammatical narrative/is);
  assert.match(reconciliation, /A title or body violation is a content finding.+with the user, not a \.tex edit/is);
  assert.match(reconciliation, /before any Beamer frame is generated/is);
  assert.match(reconciliation, /never the \.tex files/is);
});

test('slides storyline defines the two title phrasing rules in story shaping and the page draft', async () => {
  const skill = await readFile(storylineSkillUrl, 'utf8');
  const shaping = markdownSection(skill, 'Shape the story');
  const draft = markdownSection(skill, 'Text-only page draft');

  assert.match(shaping, /Titles must completely avoid the "XX：XX" pattern/is);
  assert.match(shaping, /full-width `：` or ASCII `:`/is);
  assert.match(shaping, /forbids the "第X部分：标题" and "01 \/ 主题" numbering styles/is);
  assert.match(shaping, /Titles must read as continuous prose in sequence/is);
  assert.match(shaping, /reading the titles aloud in order/is);
  assert.match(draft, /no "XX：XX" two-part label pattern, and the full title sequence reads as coherent prose in deck order/is);
});

test('slide content bans contrast-repetition constructions and one-sentence summaries', async () => {
  const [storyline, beamer, quality] = await Promise.all([
    readFile(storylineSkillUrl, 'utf8'),
    readFile(slidesSkillUrl, 'utf8'),
    readFile(qualityReferenceUrl, 'utf8'),
  ]);
  const shaping = markdownSection(storyline, 'Shape the story');
  const draft = markdownSection(storyline, 'Text-only page draft');
  const reconciliation = markdownSection(storyline, 'Slide-order reconciliation');
  const generation = markdownSection(beamer, 'Generate a new deck');

  // Contrast-repetition ban ("不是X，而是Y" / "not X, but Y") everywhere.
  assert.match(shaping, /Completely ban contrast-repetition constructions everywhere in the deck.+不是X，而是Y/is);
  assert.match(shaping, /"not X, but Y", "not just X, it's Y"/is);
  assert.match(shaping, /Never build a bullet list as staged contrasts/is);
  // One-sentence summary ban at openings and closings.
  assert.match(shaping, /No one-sentence summary at the opening or closing of a page or of the whole deck/is);
  assert.match(shaping, /一句话总结/is);
  assert.match(shaping, /In one sentence/is);
  // Body copy follows the same bans; label-colon lead-ins in bullets are banned too.
  assert.match(draft, /bullets and captions must not open with a label-colon lead-in \("方法：…", "结果：…", "Method: …"\)/is);
  assert.match(draft, /"不是X，而是Y" contrast-repetition constructions, opening\/closing one-sentence summaries, defensive writing, and "specifics then sweep" summary clauses/is);
  // Reconciliation checks the body bans as content findings.
  assert.match(reconciliation, /no "不是X，而是Y"\/"not X, but Y" contrast-repetition construction, no opening\/closing one-sentence summary, no defensive writing \(unsourced hedging qualifiers, boilerplate disclaimers, over-attribution, or apologia\), and no "specifics then sweep" summary clause anywhere in page text/is);
  assert.match(reconciliation, /A title or body violation is a content finding/is);
  // Beamer generation and quality reference carry the same bans.
  assert.match(generation, /Body copy obeys the same phrasing bans as titles.+no "不是X，而是Y"\/"not X, but Y" contrast-repetition construction.+no page opens or closes with a one-sentence summary of itself, no defensive writing anywhere.+no "specifics then sweep" summary clause/is);
  assert.match(generation, /Title and body violations are content findings that return to the Markdown content plan with the user, never \.tex edits/is);
  assert.match(quality, /no "不是X，而是Y" contrast-repetition construction or its English equivalents \("not X, but Y", "not just X, it's Y"\)/is);
  assert.match(quality, /no opening or closing one-sentence summary \("一句话总结", "In one sentence", "The takeaway"\)/is);
  assert.match(quality, /no label-colon bullet or caption lead-ins, no "不是X，而是Y"\/"not X, but Y" contrast-repetition constructions, no opening or closing one-sentence summaries, no defensive writing \(unsourced hedging, boilerplate disclaimers, over-attribution, apologia\), and no "specifics then sweep" summary clauses/is);
  assert.match(quality, /A title or body violation is a content finding/is);
  assert.match(quality, /no "specifics then sweep" summary clause: a concrete factual clause followed by a summarizing clause that elevates it to a sweeping whole/is);
  assert.match(quality, /"画面＋全称升华" two-beat sentence/is);
  // Defensive writing ban: storyline, workflow definitions, and quality reference.
  assert.match(shaping, /No defensive writing anywhere in the deck.+no hedging qualifiers that dilute a claim/is);
  assert.match(shaping, /unless the hedge is itself a sourced fact.+measured variance, a cited confidence interval, a genuinely known scope limit/is);
  assert.match(shaping, /no boilerplate disclaimers or "本文仅代表个人观点"; no over-attribution \("许多研究表明" without a citation\)/is);
  assert.match(quality, /no defensive writing — no unsourced hedging qualifiers \(可能\/或许\/某种程度上, "possibly\/perhaps\/somewhat\/relatively", "it is worth noting that", "值得注意的是"\)/is);
  assert.match(quality, /State the result and its actual scope; cut the armor/is);
});

test('writing workflow bans defensive writing in every deliverable', async () => {
  const definitions = await readFile(definitionsUrl, 'utf8');

  assert.match(definitions, /No defensive writing in any deliverable: never pad a claim with hedging qualifiers that dilute it/is);
  assert.match(definitions, /可能\/或许\/大概\/某种程度上\/在一定条件下\/通常来说/is);
  assert.match(definitions, /"可能\/possibly\/perhaps\/somewhat\/relatively\/fairly\/quite", "it is worth noting that", "值得注意的是", "generally speaking", "to some extent"/is);
  assert.match(definitions, /unless the hedge is itself a sourced fact \(measured variance, a cited confidence interval, a genuinely known scope limit\)/is);
  assert.match(definitions, /Never add self-protective filler: boilerplate disclaimers, "本文仅代表个人观点", over-attribution \("许多研究表明" without a citation\), apologia for limitations nobody asked about, or a paragraph that argues against its own claim before making it/is);
  assert.match(definitions, /State the result and its actual scope; cut the armor/is);
  // Visual labels carry the same defensive-writing ban.
  assert.match(definitions, /no defensive writing — no unsourced hedging qualifiers \(可能\/或许\/"possibly"\/"approximately" without a measured basis\), no disclaimer text, no over-attribution, no apologia in explanation text/is);
  // "Specifics then sweep" pseudo-parallel summary clause ban.
  assert.match(definitions, /No "specifics then sweep" summary clause: do not follow a concrete factual clause with a summarizing clause that elevates it to a sweeping whole/is);
  assert.match(definitions, /这些共同构成了……\/这一切标志着……\/正是这些……成就了……/is);
  assert.match(definitions, /"Together, these \.\.\.", "All of this marked \.\.\.", "It was these \.\.\. that \.\.\."/is);
  assert.match(definitions, /same object, scope adverb, agent, completion verb\), forming a loose pseudo-parallel couplet/is);
  assert.match(definitions, /documentary-narration "画面＋全称升华" two-beat sentence — a stock template of AI-written popular history/is);
});

test('Beamer quality reference records the slide-order reconciliation step', async () => {
  const reference = await readFile(qualityReferenceUrl, 'utf8');

  assert.match(reference, /a separate `task` reconciles the slide order on the Markdown content plan/is);
  assert.match(reference, /content overlap between slides.+semantically coherent.+logical overall progression/is);
  assert.match(reference, /no page title uses the "XX：XX" two-part label pattern.+full-width `：` or ASCII `:`/is);
  assert.match(reference, /reading all page titles in deck order forms a coherent, grammatical narrative/is);
  assert.match(reference, /A title or body violation is a content finding.+never a direct \.tex edit/is);
  assert.match(reference, /Reordering edits only the Markdown content plan, never the \.tex files/is);
});

function markdownSection(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`);
  const next = markdown.indexOf('\n## ', start + 1);
  assert.ok(start >= 0, `missing section ${heading}`);
  return markdown.slice(start, next < 0 ? markdown.length : next);
}
