import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontendUrl = new URL('../skills/frontend-design/SKILL.md', import.meta.url);
const canvasUrl = new URL('../skills/canvas-design/SKILL.md', import.meta.url);
const slidesUrl = new URL('../skills/latex-beamer-slides/SKILL.md', import.meta.url);
const svgUrl = new URL('../skills/svg-flowchart/SKILL.md', import.meta.url);
const visionerUrl = new URL('../agents/visioner.md', import.meta.url);
const architectureUrl = new URL('../../../docs/ARCHITECTURE.md', import.meta.url);

test('frontend visual work uses designer ownership, a current render matrix, and independent visioner QA', async () => {
  const skill = await readFile(frontendUrl, 'utf8');

  assertInOrder(skill, [
    /`designer` owns the complete design and source revision checkpoint/i,
    /`task` owns integration and authorized execution.+integrates the exact designer revision.+runs it in the intended renderer.+binds one revision identifier.+captures fresh evidence/is,
    /`visioner` independently reviews.+current-revision evidence/is,
  ]);
  assert.match(skill, /supported visual finding.+`designer` applies.+`task` rerenders.+`visioner` reviews only the fresh rerender.+at most once/is);
  assert.match(skill, /Main only authorizes external effects during initial setup and accepts final delivery.+does not render, modify, reconcile, or mediate the visual loop/is);
  assert.match(skill, /required responsive viewports.+relevant interaction states/is);
  assert.match(skill, /one revision identifier.+never mix.+stale.+evidence/is);
  assert.match(skill, /designer.+unavailable.+specific unfulfilled design checkpoint.+Agent fallback/is);
  assert.match(skill, /visioner.+unavailable.+missing independent current-revision visual evidence/is);
  assert.match(skill, /Main review.+source checks.+static checks.+designer self-review.+do not count.+independent visioner evidence/is);
  assert.doesNotMatch(skill, /Main (?:reconciles|integrates|binds|runs|renders|modifies) the (?:designer|visual|current)/i);
  assertAdvisoryOnly(skill);
});

test('canvas visual work uses designer ownership, current exports, and independent visioner QA', async () => {
  const skill = await readFile(canvasUrl, 'utf8');

  assertInOrder(skill, [
    /`designer` owns the complete design and source revision checkpoint/i,
    /`task` owns integration and authorized execution.+integrates the exact designer revision.+binds one revision identifier.+fresh intended-size export.+reduced preview/is,
    /`visioner` independently reviews.+current-revision evidence/is,
  ]);
  assert.match(skill, /supported visual finding.+`designer` applies.+`task` re-exports.+`visioner` reviews only the fresh export.+at most once/is);
  assert.match(skill, /Main only authorizes external effects during initial setup and accepts final delivery.+does not render, export, modify, reconcile, or mediate the visual loop/is);
  assert.match(skill, /intended-size export.+useful reduced preview.+when relevant/is);
  assert.match(skill, /one revision identifier.+never mix.+stale.+evidence/is);
  assert.match(skill, /designer.+unavailable.+specific unfulfilled design checkpoint.+Agent fallback/is);
  assert.match(skill, /visioner.+unavailable.+missing independent current-revision visual evidence/is);
  assert.match(skill, /Main review.+source checks.+static checks.+designer self-review.+do not count.+independent visioner evidence/is);
  assert.doesNotMatch(skill, /Main (?:reconciles|integrates|binds|runs|renders|exports|modifies) the (?:designer|visual|current)/i);
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
  assert.deepEqual(frontmatterList(visioner, 'tools'), ['read', 'inspect_image', 'yield']);
  assert.match(visioner, /read-only/i);
  assert.match(visioner, /Main review.+source checks.+static checks.+designer self-review.+independent visioner evidence/is);
  assert.doesNotMatch(visioner, /^\s*- (?:edit|write)$/m);
  assertAdvisoryOnly(visioner);
});

test('existing slides and SVG Skills retain designer, current-render, and visioner ordering', async () => {
  const [slides, svg] = await Promise.all([
    readFile(slidesUrl, 'utf8'),
    readFile(svgUrl, 'utf8'),
  ]);
  const generation = markdownSection(slides, 'Generate a new deck');
  const modification = markdownSection(slides, 'Modify an existing deck');

  assertInOrder(generation, [
    /Have `designer` perform the final layout pass/i,
    /Have `task` validate and integrate the complete designer revision/i,
    /Have `task` recompile and render that exact designer revision/i,
    /Have `visioner` independently inspect/i,
  ]);
  assertInOrder(modification, [
    /Have `designer` perform a final layout pass/i,
    /Have `task` validate and integrate the complete designer revision/i,
    /Have `task` recompile and render that exact designer revision/i,
    /Have `visioner` independently review/i,
  ]);
  assertInOrder(svg, [
    /`designer` owns one complete SVG source revision/is,
    /`task` runs the bundled checker/i,
    /`task` renders the current SVG revision/i,
    /visioner` independently inspect only the fresh latest full-size and 60% renders/i,
  ]);
});

test('architecture records the visual workflow as a soft evidence invariant', async () => {
  const architecture = await readFile(architectureUrl, 'utf8');

  assert.match(
    architecture,
    /visual-delivery.+`designer` owns the design or source revision.+`task` owns rendering, compilation, export, and optional imagegen execution.+`visioner` reviews fresh current-revision evidence.+Main retains setup authorization and final acceptance only and does not mediate the visual loop.+hard gate.+router.+fixed fanout.+automatic loop.+completion authority/is,
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
