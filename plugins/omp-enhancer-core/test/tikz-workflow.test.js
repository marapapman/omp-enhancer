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

test('diagram.tikz is the single bounded subagent-driven TikZ Primary with a 9-step asset+figure chain', () => {
  const workflow = workflowCatalog['diagram.tikz'];

  assert.equal(WORKFLOW_CATALOG_VERSION, 26);
  assert.ok(workflowIds.includes('diagram.tikz'));
  assert.equal(workflowIds.includes('diagram.svg'), false);
  assert.ok(workflow);
  assert.equal(workflow.delegationDefault, 'subagent-driven');
  assert.deepEqual(workflow.skills, ['tikz-diagram', 'svg-flowchart']);
  assert.deepEqual(workflow.catalogSkills, []);
  assert.deepEqual(workflow.roles, ['designer', 'task', 'visioner']);
  assert.match(workflow.chooseWhen, /TikZ.+academic|academic.+TikZ|flowchart.+architecture|decision flow.+deploy pipeline/iu);
  assert.match(workflow.chooseWhen, /SVG.+only icon assets.+preview evidence.+compatibility supplements/iu);

  assert.equal(workflow.steps.length, 9);

  const steps = workflow.steps.join(' ');
  const scope = workflow.scopeNotes.join(' ');
  const quality = workflow.qualityChecks.join(' ');
  const delegation = workflow.delegation.join(' ');

  // Phased chain: blueprint -> asset prep -> asset review -> ELK -> render -> whole-figure review -> bounded revision -> deliver
  assert.match(steps, /Main fixes audience.+output path.+target format.+icon requirements.+asset source boundaries/iu);
  assert.match(steps, /graphical blueprint.+semantic graph.+per-node icon plan.+manifest draft.+no final coordinates/iu);
  assert.match(steps, /Prepare and validate icon assets.+OpenTikZ.+imagegen.+SVG assets.+previews and manifest/iu);
  assert.match(steps, /Review asset previews per icon.+reject or approve.+only new previews/iu);
  assert.match(steps, /Generate ELK IR.+tikz_generate_diagram.+TikZ source.+round-trip check/iu);
  assert.match(steps, /tikz_render.+revision-bound PDF\/SVG\/PNG/iu);
  assert.match(steps, /Independently review fresh whole-figure renders.+semantic completeness.+icon clarity.+layering.+overlap.+clipping.+labels.+branch semantics.+manifest disclosure/iu);
  assert.match(steps, /At most one bounded revision.+unchanged artifacts are not re-reviewed/iu);
  assert.match(steps, /Deliver source files.+semantic graph.+manifest.+preview\/render evidence.+limitations.+asset provenance/iu);

  assert.equal(workflow.delegation.length, 7);
  assert.deepEqual(workflow.delegation, [
    'step-2: designer owns the semantic blueprint and per-icon plan while preserving scope',
    'step-3: task prepares and validates icon assets and writes the asset manifest',
    'step-4: visioner independently and read-only reviews fresh asset previews and flags unsupported icons',
    'step-5: designer owns the ELK graph IR, layout generation, and final TikZ source revision',
    'step-6: task invokes the fixed tikz_render renderer for the approved current revision',
    'step-7: visioner independently and read-only reviews the fresh current-revision renders',
    'step-8: designer applies supported findings, task rerenders, and visioner reviews only fresh rerenders',
  ]);

  assert.match(scope, /SVG and other formats are only icon assets.+geometry always comes from ELK IR/iu);
  assert.match(scope, /OpenTikZ.+read-only source/iu);
  assert.match(scope, /imagegen.+only when explicitly authorized/iu);
  assert.match(scope, /deterministic fixed-command pipeline.+shell escape disabled/iu);
  assert.match(scope, /No gate.+router.+fork.+loop.+bounded and advisory/iu);
  assert.match(scope, /visioner review is independent and read-only.+does not render.+edit.+decide completion/iu);

  assert.match(quality, /semantic completeness.+ELK graph IR.+edit-contract.+compile.+icon legibility.+raster disclosure/iu);
  assert.doesNotMatch(`${steps} ${scope} ${delegation}`, /retry until|repeat until|automatic repair|automatic retry|block:\s*true|continue:\s*true/iu);
});

test('TikZ composes only with independently requested language, slide, and design work', () => {
  const tikz = workflowCatalog['diagram.tikz'];
  const latex = workflowCatalog['writing.latex'];

  assert.deepEqual(tikz.composeWith, [
    'design.visual',
    'slides.generate',
    'slides.modify',
    'writing.zh',
    'writing.en',
  ]);
  assert.equal(tikz.composeWith.includes('diagram.svg'), false);
  assert.equal(latex.composeWith.includes('diagram.tikz'), false);
  assert.match(`${latex.chooseWhen} ${latex.scopeNotes.join(' ')}`, /TikZ.+alone.+diagram\.tikz/iu);

  for (const id of ['writing.zh', 'writing.en', 'slides.generate', 'slides.modify', 'design.visual']) {
    assert.equal(workflowCatalog[id].composeWith.includes('diagram.tikz'), true, id);
    assert.equal(workflowCatalog[id].composeWith.includes('diagram.svg'), false, `${id} must not compose removed diagram.svg`);
  }
});

test('workflow Skill classifies TikZ as the single specialized visual output distinct from LaTeX prose', () => {
  const index = buildWorkflowSkillIndexMarkdown();
  const reference = buildWorkflowSkillReferenceMarkdown('diagram.tikz');

  assert.match(
    index,
    /#### specialized outputs[\s\S]*`slides\.generate`[\s\S]*`slides\.modify`[\s\S]*`diagram\.tikz`/iu,
  );
  assert.match(index, /TikZ.+`diagram\.tikz`/iu);
  assert.match(index, /SVG or other formats are only icon assets.+compatibility supplements/iu);
  assert.match(index, /`diagram\.tikz`[^\n]*D=\[`skill:\/\/tikz-diagram`, `skill:\/\/svg-flowchart`\][^\n]*PLAN URI/iu);
  assert.match(reference, /# `diagram\.tikz` workflow reference/iu);
  assert.match(reference, /Agent candidates: `designer`, `task`, `visioner`/iu);
  assert.doesNotMatch(reference, /automatic retry|retry until|repeat until|automatic repair/iu);
  assert.doesNotMatch(index, /standalone SVG.*Primary|Direct standalone SVG/iu);
});