import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontendUrl = new URL('../skills/frontend-design/SKILL.md', import.meta.url);
const canvasUrl = new URL('../skills/canvas-design/SKILL.md', import.meta.url);
const slidesUrl = new URL('../skills/latex-beamer-slides/SKILL.md', import.meta.url);
const architectureUrl = new URL('../../../docs/ARCHITECTURE.md', import.meta.url);

test('frontend visual work uses task ownership, a current render matrix, and a single read-only visual review', async () => {
  const skill = await readFile(frontendUrl, 'utf8');

  assertInOrder(skill, [
    /`task` owns the complete design, source revision, integration, and export\/render checkpoint/i,
    /exactly one owner—Main, or a task that did not produce the revision/i,
  ]);
  assert.match(skill, /supported visual finding.+`task` applies the bounded source revision.+the review owner examines only the fresh rerender.+at most once/is);
  assert.match(skill, /Main only authorizes external effects during initial setup and accepts final delivery.+does not render, modify, reconcile, or mediate the visual loop/is);
  assert.match(skill, /responsive targets.+reachable interaction states/is);
  assert.match(skill, /one revision identifier.+never mix.+stale.+evidence/is);
  assert.match(skill, /no read-only visual reviewer is available.+missing independent current-revision visual evidence/is);
  assert.match(skill, /source checks.+static checks.+self-review by the producing agent.+not independent visual evidence/is);
  assert.doesNotMatch(skill, /Main (?:reconciles|integrates|binds|runs|renders|modifies) the (?:designer|visual|current)/i);
  assert.doesNotMatch(skill, /designer/i);
  assertAdvisoryOnly(skill);
});

test('canvas visual work uses task ownership, current exports, and a single read-only visual review', async () => {
  const skill = await readFile(canvasUrl, 'utf8');

  assertInOrder(skill, [
    /`task` owns the complete design, source revision, integration, and export\/render checkpoint/i,
    /exactly one owner—Main, or a task that did not produce the revision/i,
  ]);
  assert.match(skill, /supported visual finding.+`task` applies the bounded source revision.+the review owner examines only the fresh export.+at most once/is);
  assert.match(skill, /Main only authorizes external effects during initial setup and accepts final delivery.+does not render, export, modify, reconcile, or mediate the visual loop/is);
  assert.match(skill, /final exported artifact at its intended size/i);
  assert.match(skill, /one revision identifier.+never mix.+stale.+evidence/is);
  assert.match(skill, /no read-only visual reviewer is available.+missing independent current-revision visual evidence/is);
  assert.match(skill, /source checks.+static checks.+self-review by the producing agent.+not independent visual evidence/is);
  assert.doesNotMatch(skill, /Main (?:reconciles|integrates|binds|runs|renders|exports|modifies) the (?:designer|visual|current)/i);
  assert.doesNotMatch(skill, /designer/i);
  assertAdvisoryOnly(skill);
});

test('existing slides retain task layout and a read-only visual review', async () => {
  const slides = await readFile(slidesUrl, 'utf8');
  const generation = markdownSection(slides, 'Generate a new deck');
  const modification = markdownSection(slides, 'Modify an existing deck');

  assertInOrder(generation, [
    /Have `task` compile with the native engine/i,
    /single read-only visual precheck/i,
    /Have `task` perform the final layout pass/i,
    /Have `task` recompile and render that exact layout revision/i,
    /Perform the single read-only visual review of the latest rendered pages/i,
  ]);
  assertInOrder(modification, [
    /Have `task` compile and render the affected deck/i,
    /single read-only visual precheck/i,
    /Have `task` perform a final layout pass/i,
    /Have `task` recompile and render that exact layout revision/i,
    /Perform the single read-only visual review of the latest renders/i,
  ]);
});

test('architecture records the visual workflow as a soft evidence invariant', async () => {
  const architecture = await readFile(architectureUrl, 'utf8');

  assert.match(
    architecture,
    /visual-delivery.+drawio-skill.+drawio@365-skills.+exported PNG read-only in one pass.+at most one fix round.+advisory.+hard gate.+router.+fixed fanout.+automatic loop.+completion authority/is,
  );
  assert.match(architecture, /Main \(or a task that did not draw the revision\) reviews that exported PNG read-only in one pass/i);
  assert.doesNotMatch(architecture, new RegExp(['vis', 'ioner'].join(''), 'iu'));
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

function markdownSection(content, heading) {
  const start = content.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `missing section: ${heading}`);
  const rest = content.slice(start + heading.length + 3);
  const end = rest.search(/^##\s/m);
  return end === -1 ? rest : rest.slice(0, end);
}
