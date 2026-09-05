import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontendUrl = new URL('../skills/frontend-design/SKILL.md', import.meta.url);
const canvasUrl = new URL('../skills/canvas-design/SKILL.md', import.meta.url);
const slidesUrl = new URL('../skills/latex-beamer-slides/SKILL.md', import.meta.url);
const visionerUrl = new URL('../agents/visioner.md', import.meta.url);
const architectureUrl = new URL('../../../docs/ARCHITECTURE.md', import.meta.url);

test('frontend visual work uses task ownership, a current render matrix, and independent visioner QA', async () => {
  const skill = await readFile(frontendUrl, 'utf8');

  assertInOrder(skill, [
    /`task` owns the complete design, source revision, integration, and export\/render checkpoint/i,
    /`visioner` independently reviews.+current-revision evidence/is,
  ]);
  assert.match(skill, /supported visual finding.+`task` applies the bounded source revision.+`visioner` reviews only the fresh rerender.+at most once/is);
  assert.match(skill, /Main only authorizes external effects during initial setup and accepts final delivery.+does not render, modify, reconcile, or mediate the visual loop/is);
  assert.match(skill, /responsive targets.+reachable interaction states/is);
  assert.match(skill, /one revision identifier.+never mix.+stale.+evidence/is);
  assert.match(skill, /visioner.+unavailable.+missing independent current-revision visual evidence/is);
  assert.match(skill, /Main review.+source checks.+static checks.+task self-review.+do not count.+independent visioner evidence/is);
  assert.doesNotMatch(skill, /Main (?:reconciles|integrates|binds|runs|renders|modifies) the (?:designer|visual|current)/i);
  assert.doesNotMatch(skill, /designer/i);
  assertAdvisoryOnly(skill);
});

test('canvas visual work uses task ownership, current exports, and independent visioner QA', async () => {
  const skill = await readFile(canvasUrl, 'utf8');

  assertInOrder(skill, [
    /`task` owns the complete design, source revision, integration, and export\/render checkpoint/i,
    /`visioner` independently reviews.+current-revision evidence/is,
  ]);
  assert.match(skill, /supported visual finding.+`task` applies the bounded source revision.+`visioner` reviews only the fresh export.+at most once/is);
  assert.match(skill, /Main only authorizes external effects during initial setup and accepts final delivery.+does not render, export, modify, reconcile, or mediate the visual loop/is);
  assert.match(skill, /final exported artifact at its intended size/i);
  assert.match(skill, /one revision identifier.+never mix.+stale.+evidence/is);
  assert.match(skill, /visioner.+unavailable.+missing independent current-revision visual evidence/is);
  assert.match(skill, /Main review.+source checks.+static checks.+task self-review.+do not count.+independent visioner evidence/is);
  assert.doesNotMatch(skill, /Main (?:reconciles|integrates|binds|runs|renders|exports|modifies) the (?:designer|visual|current)/i);
  assert.doesNotMatch(skill, /designer/i);
  assertAdvisoryOnly(skill);
});

test('visioner independently reviews UI states and static exports without mutation or authority', async () => {
  const visioner = await readFile(visionerUrl, 'utf8');

  assert.match(visioner, /UI.+web.+responsive screenshots.+interaction states/is);
  assert.match(visioner, /static canvas.+export artifacts/is);
  assert.match(visioner, /required responsive viewports?.+relevant interaction states/is);
  assert.match(visioner, /intended-size export.+useful reduced preview.+when relevant/is);
  assert.match(visioner, /same current revision.+stale|stale.+same current revision/is);
  assert.match(visioner, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
  assert.deepEqual(frontmatterList(visioner, 'tools'), ['read', 'yield']);
  assert.match(visioner, /read-only/i);
  assert.match(visioner, /Main review.+source checks.+static checks.+task self-review.+independent visioner evidence/is);
  assert.doesNotMatch(visioner, /^\s*- (?:edit|write)$/m);
  assert.doesNotMatch(visioner, /designer/i);
  assertAdvisoryOnly(visioner);
});

test('existing slides retain task layout and visioner QA', async () => {
  const slides = await readFile(slidesUrl, 'utf8');
  const generation = markdownSection(slides, 'Generate a new deck');
  const modification = markdownSection(slides, 'Modify an existing deck');

  assertInOrder(generation, [
    /Have `task` compile with the native engine/i,
    /single read-only visual precheck/i,
    /Have `task` perform the final layout pass/i,
    /Have `task` recompile and render that exact layout revision/i,
    /Have `visioner` independently inspect/i,
  ]);
  assertInOrder(modification, [
    /Have `task` compile and render the affected deck/i,
    /single read-only visual precheck/i,
    /Have `task` perform a final layout pass/i,
    /Have `task` recompile and render that exact layout revision/i,
    /Have `visioner` independently review/i,
  ]);
});

test('architecture records the visual workflow as a soft evidence invariant', async () => {
  const architecture = await readFile(architectureUrl, 'utf8');

  assert.match(
    architecture,
    /visual-delivery.+drawio-skill.+drawio@365-skills.+exported PNG read-only in one pass.+at most one fix round.+advisory.+hard gate.+router.+fixed fanout.+automatic loop.+completion authority/is,
  );
});

function assertInOrder(content, patterns) {
  let previous = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    assert.ok(match, `missing contract: ${pattern}`);
    assert.ok(match.index > previous, `out-of-order contract: ${pattern}`);
    previous = match.index;
  }
}

function assertAdvisoryOnly(content) {
  assert.match(content, /advisory/i);
  assert.doesNotMatch(
    content,
    /block:\s*true|continue:\s*true|hard gate|hard router|fixed fanout|automatic (?:repair )?loop|completion authority/i,
  );
}

function frontmatterList(source, key) {
  const frontmatter = source.match(/^---\s*$([\s\S]*?)^---\s*$/m)?.[1] ?? '';
  const block = frontmatter.match(new RegExp(`^${key}:\\s*$([\\s\\S]*?)(?=^[a-zA-Z][\\w-]*:|\\Z)`, 'm'))?.[1] ?? '';
  return [...block.matchAll(/^\s*-\s+(.+)$/gm)].map((match) => match[1].trim());
}

function markdownSection(content, heading) {
  const start = content.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const rest = content.slice(start + heading.length + 3);
  const end = rest.search(/^##\s/m);
  return end === -1 ? rest : rest.slice(0, end);
}
