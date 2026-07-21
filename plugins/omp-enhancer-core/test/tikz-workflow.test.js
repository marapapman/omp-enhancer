import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowCatalog,
  workflowIds,
} from '../src/workflows/catalog.js';
import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferenceMarkdown,
} from '../src/workflows/render-skill.js';

test('diagram.tikz is one bounded subagent-driven OpenTikZ workflow', () => {
  const workflow = workflowCatalog['diagram.tikz'];

  assert.equal(WORKFLOW_CATALOG_VERSION, 21);
  assert.ok(workflowIds.includes('diagram.tikz'));
  assert.ok(workflow);
  assert.equal(workflow.delegationDefault, 'subagent-driven');
  assert.deepEqual(workflow.skills, ['tikz-diagram']);
  assert.deepEqual(workflow.catalogSkills, []);
  assert.deepEqual(workflow.roles, ['designer', 'visioner']);
  assert.match(workflow.chooseWhen, /TikZ.+paper|paper.+TikZ/iu);

  const steps = workflow.steps.join(' ');
  const scope = workflow.scopeNotes.join(' ');
  const quality = workflow.qualityChecks.join(' ');
  const delegation = workflow.delegation.join(' ');

  assert.match(steps, /semantic figure spec.+node.+edge.+branch.+group.+flow direction.+asset manifest/iu);
  assert.match(steps, /OpenTikZ.+catalog.+copy.+user.+project.+edit_contract.+parameter.+invariant.+node nam/iu);
  assert.match(steps, /Main.+optional.+OMP.+imagegen.+missing node icon.+visible.+useful/iu);
  assert.match(steps, /imagegen.+never.+OpenTikZ.+library.+asset manifest.+raster disclosure/iu);
  assert.match(steps, /tikz_prepare_asset.+normalized.+SHA-256|SHA-256.+tikz_prepare_asset/iu);
  assert.match(steps, /tikz_render.+fixed.+argument.+shell false.+no shell escape/iu);
  assert.match(steps, /temporary workspace.+PDF.+SVG.+full-size.+60%/iu);
  assert.match(steps, /current revision.+semantic figure spec.+asset manifest.+icon legibility.+raster disclosure/iu);
  assert.match(steps, /Main.+disposition.+accepted.+bounded new revision.+at most one fresh affected.+unchanged/iu);
  assert.match(steps, /report.+source.+spec.+asset manifest.+render.+review.+limitations.+no verdict.+completion/iu);

  assert.match(delegation, /step-2: designer.+OpenTikZ.+semantic figure spec.+asset manifest/iu);
  assert.match(delegation, /step-4: designer.+TikZ source.+asset/iu);
  assert.match(delegation, /step-6: visioner.+full-size.+60%.+current revision/iu);
  assert.match(delegation, /step-7: designer.+Main-accepted.+visioner.+at most one.+fresh/iu);

  assert.match(scope, /Main.+exclusive.+imagegen.+host.+permission/iu);
  assert.match(scope, /imagegen.+optional.+not.+permission|optional.+imagegen.+not.+permission/iu);
  assert.match(scope, /OpenTikZ.+read-only.+copy/iu);
  assert.match(scope, /fixed renderer.+never.+user-supplied.+project-configured.+command/iu);
  assert.match(scope, /no.+gate.+router.+automatic.+loop/iu);
  assert.match(quality, /semantic completeness.+edit-contract.+compile.+current-revision.+full-size.+60%.+icon legibility.+raster disclosure/iu);
  assert.doesNotMatch(`${steps} ${scope} ${delegation}`, /retry until|repeat until|automatic repair|block:\s*true|continue:\s*true/iu);
});

test('TikZ composes only with independently requested language, slide, and design work', () => {
  const tikz = workflowCatalog['diagram.tikz'];
  const svg = workflowCatalog['diagram.svg'];
  const latex = workflowCatalog['writing.latex'];

  assert.deepEqual(tikz.composeWith, [
    'design.visual',
    'slides.generate',
    'slides.modify',
    'writing.zh',
    'writing.en',
  ]);
  assert.equal(svg.composeWith.includes('diagram.tikz'), false);
  assert.equal(tikz.composeWith.includes('diagram.svg'), false);
  assert.equal(latex.composeWith.includes('diagram.tikz'), false);
  assert.match(`${latex.chooseWhen} ${latex.scopeNotes.join(' ')}`, /TikZ.+alone.+diagram\.tikz/iu);

  for (const id of ['writing.zh', 'writing.en', 'slides.generate', 'slides.modify', 'design.visual']) {
    assert.equal(workflowCatalog[id].composeWith.includes('diagram.tikz'), true, id);
  }
});

test('workflow Skill classifies TikZ as a specialized output distinct from SVG and LaTeX prose', () => {
  const index = buildWorkflowSkillIndexMarkdown();
  const reference = buildWorkflowSkillReferenceMarkdown('diagram.tikz');

  assert.match(
    index,
    /#### specialized outputs[\s\S]*`slides\.generate`[\s\S]*`slides\.modify`[\s\S]*`diagram\.svg`[\s\S]*`diagram\.tikz`/iu,
  );
  assert.match(index, /direct standalone SVG.+`diagram\.svg`.+TikZ.+`diagram\.tikz`/iu);
  assert.match(index, /TikZ source alone.+not.+`writing\.latex`/iu);
  assert.match(index, /`diagram\.tikz`[^\n]*D=\[`skill:\/\/tikz-diagram`\][^\n]*PLAN URI/iu);
  assert.match(reference, /# `diagram\.tikz` workflow reference/iu);
  assert.match(reference, /Agent candidates: `designer`, `visioner`/iu);
  assert.doesNotMatch(reference, /hard gate|hard router|automatic retry|retry until|repeat until/iu);
});
