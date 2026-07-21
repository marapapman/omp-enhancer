import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowCatalog,
  workflowDefinitions,
} from '../src/workflows/catalog.js';
import { buildWorkflowSkillIndexMarkdown } from '../src/workflows/render-skill.js';

const VISUAL_WORKFLOW_IDS = [
  'design.visual',
  'slides.generate',
  'slides.modify',
  'diagram.svg',
  'diagram.tikz',
];

const VISUAL_CHECKPOINTS = {
  'design.visual': { designer: 'step-3', task: 'step-4', visioner: 'step-5' },
  'slides.generate': { designer: 'step-7', task: 'step-9', visioner: 'step-10' },
  'slides.modify': { designer: 'step-5', task: 'step-7', visioner: 'step-8' },
  'diagram.svg': { designer: 'step-2', task: 'step-3', visioner: 'step-4' },
  'diagram.tikz': { designer: 'step-4', task: 'step-5', visioner: 'step-6' },
};

test('every visual workflow exposes designer then parent-bound render then visioner', () => {
  for (const id of VISUAL_WORKFLOW_IDS) {
    const workflow = workflowCatalog[id];
    const definition = workflowDefinitions.find((candidate) => candidate.id === id);
    const checkpoints = VISUAL_CHECKPOINTS[id];
    const stepIds = definition.steps.map(({ id: stepId }) => stepId);
    const scope = workflow.scopeNotes.join(' ');

    assert.equal(workflow.roles.includes('designer'), true, `${id} needs designer`);
    assert.equal(workflow.roles.includes('visioner'), true, `${id} needs visioner`);
    assert.ok(
      workflow.delegation.some((line) => line.startsWith(`${checkpoints.designer}:`) && /designer/iu.test(line)),
      `${id} must assign its design/source checkpoint to designer`,
    );
    assert.ok(
      workflow.delegation.some((line) => line.startsWith(`${checkpoints.visioner}:`) && /visioner.+independent/iu.test(line)),
      `${id} must assign independent current-render review to visioner`,
    );
    assert.ok(
      stepIds.indexOf(checkpoints.designer) < stepIds.indexOf(checkpoints.task)
        && stepIds.indexOf(checkpoints.task) < stepIds.indexOf(checkpoints.visioner),
      `${id} must keep designer -> task render -> visioner dependency order`,
    );
    assert.match(
      scope,
      /designer owns the design or source revision.+task owns rendering.+visioner independently.+reviews.+current render or layout/iu,
      `${id} must name the visual-stage ownership chain`,
    );
    assert.match(
      scope,
      /Non-visual stages.+not assigned to designer or visioner merely because.+visual/iu,
      `${id} must keep non-visual stages with their real owners`,
    );
  }
});

test('missing visual Agents remain precise visible limitations rather than substitute evidence', () => {
  for (const id of VISUAL_WORKFLOW_IDS) {
    const scope = workflowCatalog[id].scopeNotes.join(' ');

    assert.match(
      scope,
      /designer is unavailable.+precise unfulfilled design checkpoint.+fallback=Agent availability.+Main.+not.+self-substitute.+designer evidence/iu,
      `${id} must preserve missing designer evidence`,
    );
    assert.match(
      scope,
      /visioner is unavailable.+missing independent current-revision visual evidence.+source inspection.+compile success.+designer self-review.+Main self-review.+not.+visioner evidence/iu,
      `${id} must preserve missing visioner evidence`,
    );
    assert.match(
      scope,
      /visible limitations.+never.+gate.+router.+fixed dispatch.+completion condition.+automatic loop/iu,
      `${id} must keep visual limitations advisory`,
    );
  }
});

test('compact index composes visual design only for an independently requested visual deliverable', () => {
  const index = buildWorkflowSkillIndexMarkdown();

  assert.match(
    index,
    /VISUAL:[^\n]*non-visual Primary[^\n]*independently requested UI\/layout\/static-visual deliverable[^\n]*`design\.visual` Add-on/iu,
  );
  assert.match(
    index,
    /VISUAL:[^\n]*standalone slide\/SVG\/TikZ[^\n]*specialized Primary[^\n]*add `design\.visual` only[^\n]*separate visual-design work\/output/iu,
  );
});
