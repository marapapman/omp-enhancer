import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const slidesSkillUrl = new URL('../skills/latex-beamer-slides/SKILL.md', import.meta.url);
const storylineSkillUrl = new URL('../skills/slides-storyline/SKILL.md', import.meta.url);
const conversionSkillUrl = new URL('../skills/beamer-to-powerpoint/SKILL.md', import.meta.url);
const qualityReferenceUrl = new URL('../skills/latex-beamer-slides/references/beamer-quality.md', import.meta.url);

test('Beamer generation checks the template before confirming a story and authoring frames', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const generation = markdownSection(skill, 'Generate a new deck');

  const inspectTemplate = generation.indexOf('Inspect template readiness');
  const discussTemplate = generation.indexOf('If the template is not configured');
  const discussStory = generation.indexOf('load `slides-storyline`');
  const generateFrames = generation.indexOf('Generate the deck from the confirmed template and outline');
  const renderQa = generation.indexOf('Compile with the native engine');

  assert.ok(inspectTemplate >= 0);
  assert.ok(inspectTemplate < discussTemplate);
  assert.ok(discussTemplate < discussStory);
  assert.ok(discussStory < generateFrames);
  assert.ok(generateFrames < renderQa);
  assert.match(generation, /visual character, logo or explicit no-logo choice, aspect ratio, fonts, colors/i);
  assert.match(generation, /obtain user confirmation before authoring frames/i);
  assert.match(generation, /only files carrying that marker/i);
});

test('Beamer modification stays bounded to language and existing style', async () => {
  const skill = await readFile(slidesSkillUrl, 'utf8');
  const modification = markdownSection(skill, 'Modify an existing deck');

  assert.match(modification, /wording, language-norm, and existing-style changes/i);
  assert.match(modification, /preserve the story arc, frame order, template, logo, layout system/i);
  assert.match(modification, /Do not redesign the template or reopen story planning/i);
  assert.match(modification, /Do not require template discussion or a story-outline checkpoint/i);
  assert.match(skill, /choose Chinese or English writing skills from the body being changed, not from the instruction language/i);
  assert.match(skill, /`plain-chinese-writing`/);
  assert.match(skill, /`writing-review`/);
});

test('slides storyline requires a user-confirmed numbered outline without inventing evidence', async () => {
  const skill = await readFile(storylineSkillUrl, 'utf8');

  assert.match(skill, /audience, purpose, setting, duration or target slide count, output language/i);
  assert.match(skill, /Do not invent examples, citations, numbers, results, or quotations/i);
  assert.match(skill, /Present a numbered outline/i);
  assert.match(skill, /Do not generate Beamer frames until the user confirms the outline/i);
  assert.match(skill, /Do not use for ordinary edits to an existing deck/i);
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
  assert.match(reference, /Do not report visual QA from compilation alone/i);
});

function markdownSection(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`);
  const next = markdown.indexOf('\n## ', start + 1);
  assert.ok(start >= 0, `missing section ${heading}`);
  return markdown.slice(start, next < 0 ? markdown.length : next);
}
