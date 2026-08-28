import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const slidesSkillUrl = new URL('../skills/latex-beamer-slides/SKILL.md', import.meta.url);
const storylineSkillUrl = new URL('../skills/slides-storyline/SKILL.md', import.meta.url);
const conversionSkillUrl = new URL('../skills/beamer-to-powerpoint/SKILL.md', import.meta.url);
const qualityReferenceUrl = new URL('../skills/latex-beamer-slides/references/beamer-quality.md', import.meta.url);
const visionerUrl = new URL('../agents/visioner.md', import.meta.url);

test('Beamer generation checks the template before committing a story and authoring frames', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const generation = markdownSection(skill, 'Generate a new deck');

  const inspectTemplate = generation.indexOf('Inspect template readiness');
  const discussTemplate = generation.indexOf('If the template is not configured');
  const discussStory = generation.indexOf('apply the PLAN-loaded `slides-storyline`');
  const generateFrames = generation.indexOf('Generate the deck from the committed template and outline');
  const renderQa = generation.indexOf('Have `task` compile with the native engine');
  const visualPrecheck = generation.indexOf('single read-only visual precheck');
  const designerLayout = generation.indexOf('Have `designer` perform the final layout pass');
  const reconcileDesigner = generation.indexOf('Have `task` validate and integrate the complete designer revision');
  const freshRerender = generation.indexOf('Have `task` recompile and render that exact designer revision');
  const visionReview = generation.indexOf('Have `visioner` independently inspect');
  assert.ok(inspectTemplate >= 0);
  assert.ok(inspectTemplate < discussTemplate);
  assert.ok(discussTemplate < discussStory);
  assert.ok(discussStory < generateFrames);
  assert.ok(generateFrames < renderQa);
  assert.ok(visualPrecheck >= 0);
  assert.ok(renderQa < visualPrecheck);
  assert.ok(visualPrecheck < designerLayout);
  assert.ok(designerLayout < reconcileDesigner);
  assert.ok(reconcileDesigner < freshRerender);
  assert.ok(designerLayout < freshRerender);
  assert.ok(freshRerender < visionReview);
  assert.ok(designerLayout < visionReview);
  assert.match(generation, /visual character, logo or explicit no-logo choice, aspect ratio, fonts, colors/i);
  assert.match(generation, /ask the user only when a missing choice materially changes the deck/i);
  assert.match(generation, /only files carrying that marker/i);
  assert.match(generation, /fresh renders of every page.+overview or contact sheet/is);
  assert.match(generation, /revision identifier.+PDF.+render directory/is);
  assert.match(generation, /committed outline.+output language.+semantic anchors.+LaTeX structure/is);
  assert.match(generation, /text and image overlap.+crowding.+clipping.+undersized text/is);
  assert.match(generation, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
  assert.match(generation, /Do not accept `PASS` or `FAIL` as a substitute/i);
  assert.match(generation, /supported finding.+`designer` applies.+`task` rerenders.+`visioner` reviews only fresh rerendered evidence.+at most once/is);
  assert.match(generation, /Main only authorizes external effects during initial setup and accepts final delivery.+does not compile, render, modify, reconcile, or mediate the visual loop/is);
  assert.match(generation, /No review verdict grants permission to convert, publish, or complete/i);
});

test('Beamer uses one advisory current-revision precheck before each designer pass', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const paths = [
    markdownSection(skill, 'Generate a new deck'),
    markdownSection(skill, 'Modify an existing deck'),
  ];

  for (const path of paths) {
    const precheckStart = path.indexOf('Perform the single read-only visual precheck');
    const designerStart = path.indexOf('Have `designer` perform', precheckStart);
    assert.ok(precheckStart >= 0);
    assert.ok(designerStart > precheckStart);

    const precheck = path.slice(precheckStart, designerStart);
    assert.match(precheck, /exactly one owner.+`task` or Main.+chosen by Main.+completed the artifact.+native visual input/is);
    assert.match(precheck, /same current revision/is);
    assert.match(precheck, /read-only/is);
    assert.match(precheck, /advisory findings.+page.+region.+criterion.+evidence.+impact.+limitations/is);
    assert.doesNotMatch(precheck, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
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
  const designerLayout = modification.indexOf('Have `designer` perform a final layout pass');
  const freshRerender = modification.indexOf('Have `task` recompile and render that exact designer revision');
  const visionReview = modification.indexOf('Have `visioner` independently review');
  assert.ok(initialRender >= 0);
  assert.ok(precheck > initialRender);
  assert.ok(designerLayout > precheck);
  assert.ok(freshRerender > designerLayout);
  assert.ok(visionReview > freshRerender);
  assert.match(modification, /wording, language-norm, and existing-style changes/i);
  assert.match(modification, /preserve the story arc, frame order, template, logo, layout system/i);
  assert.match(modification, /Do not redesign the template or reopen story planning/i);
  assert.match(modification, /Do not require template discussion or a story-outline checkpoint/i);
  assert.match(modification, /Have `designer` perform a final layout pass on the changed frames and any pages whose layout they can influence/i);
  assert.match(modification, /Have `task` validate and integrate the complete designer revision against the requested semantic diff, LaTeX anchors, and authorized scope/i);
  assert.match(modification, /Have `task` recompile and render that exact designer revision.+revision identifier.+PDF.+render directory/is);
  assert.match(modification, /Have `visioner` independently review the latest renders/i);
  assert.match(modification, /text and image overlap.+crowding.+clipping.+undersized text/is);
  assert.match(modification, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
  assert.match(modification, /Do not accept `PASS` or `FAIL` as a substitute/i);
  assert.match(modification, /supported finding.+`designer` applies.+`task` rerenders.+`visioner` reviews only fresh rerendered evidence.+at most once/is);
  assert.match(modification, /Main only authorizes external effects during initial setup and accepts final delivery.+does not compile, render, modify, reconcile, or mediate the visual loop/is);
  assert.match(modification, /Do not widen the edit to unrelated pre-existing layout defects/i);
  assert.match(modification, /Do not split, add, remove, or reorder frames without explicit user authorization/i);
  assert.match(skill, /choose Chinese or English writing skills from the body being changed, not from the instruction language/i);
  assert.match(skill, /`plain-chinese-writing`/);
  assert.match(skill, /`writing-review`/);
});

test('slides storyline commits a numbered outline and asks only on material ambiguity', async () => {
  const skill = await readFile(storylineSkillUrl, 'utf8');

  assert.match(skill, /audience, purpose, setting, duration or target slide count, output language/i);
  assert.match(skill, /Do not invent examples, citations, numbers, results, or quotations/i);
  assert.match(skill, /Present a numbered outline/i);
  assert.match(skill, /ask only when a missing choice materially changes the deck/i);
  assert.match(skill, /explicit assumptions/i);
  assert.doesNotMatch(skill, /until the user (?:confirms|approves)|ask the user to approve/i);
  assert.match(skill, /Do not use for ordinary edits to an existing deck/i);
});

test('Beamer visual review is advisory and never an automatic repair controller', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');

  assert.match(skill, /Agent availability and capacity remain Main decisions/i);
  assert.match(skill, /No review verdict grants permission to convert, publish, or complete/i);
  assert.doesNotMatch(skill, /Main may assign.+(?:reconcile|rerender)|Main (?:reconciles|rerenders|compiles|renders) the designer revision/is);
  assert.doesNotMatch(skill, /maximum of three|have `designer` address every|have `designer` make only the necessary bounded fix/i);
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
});

test('Beamer skill supplies layout specialization while visioner reviews fresh rendered slides read-only', async () => {
  const [slidesSkill, visioner] = await Promise.all([
    readFile(slidesSkillUrl, 'utf8'),
    readFile(visionerUrl, 'utf8'),
  ]);

  assert.match(slidesSkill, /Have `designer` perform the final layout pass/i);
  assert.match(slidesSkill, /overlap, crowding, clipping, undersized text, cropped or distorted figures/is);
  assert.match(slidesSkill, /Do not split, add, remove, or reorder frames without explicit user authorization/i);
  assert.match(visioner, /slide decks.+UI\/web responsive.+static canvas.+export artifacts/is);
  assert.match(visioner, /latest full-resolution page renders and the overview or contact sheet/i);
  assert.match(visioner, /text and image overlap.+crowding.+clipping.+undersized text.+cropped or distorted images/is);
  assert.match(visioner, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
  assert.match(visioner, /page number.+visible region.+impact.+requested correction/is);
  assert.match(visioner, /Do not approve.+older render/i);
  assert.doesNotMatch(visioner, /^\s*- (?:edit|write)$/m);
});

function markdownSection(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`);
  const next = markdown.indexOf('\n## ', start + 1);
  assert.ok(start >= 0, `missing section ${heading}`);
  return markdown.slice(start, next < 0 ? markdown.length : next);
}
