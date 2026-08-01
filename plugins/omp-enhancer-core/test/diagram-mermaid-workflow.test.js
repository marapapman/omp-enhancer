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

test('diagram.mermaid is the default bounded subagent-driven Mermaid Primary with a 9-step mermaid-first chain', () => {
  const workflow = workflowCatalog['diagram.mermaid'];

  assert.equal(WORKFLOW_CATALOG_VERSION, 30);
  assert.ok(workflowIds.includes('diagram.mermaid'));
  assert.ok(workflow);
  assert.equal(workflow.delegationDefault, 'subagent-driven');
  assert.deepEqual(workflow.skills, ['mermaid-diagram', 'svg-flowchart']);
  assert.deepEqual(workflow.catalogSkills, []);
  assert.deepEqual(workflow.roles, ['designer', 'task', 'visioner']);
  assert.match(
    workflow.chooseWhen,
    /Mermaid.+academic architecture.+block diagram.+flowchart.+decision flow.+deploy pipeline/iu,
  );
  assert.match(workflow.chooseWhen, /explicit.+TikZ|LaTeX.+diagram\.tikz/iu);

  assert.equal(workflow.steps.length, 9);

  const steps = workflow.steps.join(' ');
  const scope = workflow.scopeNotes.join(' ');
  const quality = workflow.qualityChecks.join(' ');
  const delegation = workflow.delegation.join(' ');

  // mermaid-first chain: blueprint -> asset prep -> asset review -> Mermaid source -> render -> SVG review -> bounded revision -> deliver
  assert.match(steps, /Main fixes audience.+output path.+target format.+icon requirements.+asset source boundaries/iu);
  assert.match(steps, /graphical blueprint.+semantic graph.+per-node icon plan.+manifest draft.+no final coordinates/iu);
  assert.match(steps, /Prepare and validate icon assets.+OpenTikZ.+SVG assets.+previews and manifest/iu);
  assert.match(steps, /Review asset previews per icon.+reject or approve.+only new previews/iu);
  assert.match(steps, /Author the semantic graph as Mermaid source.+stable IDs.+labels.+edges.+branch conditions.+subgraphs.+direction/iu);
  assert.match(steps, /no SVG coordinate hand-editing and no tool invocation/iu);
  assert.match(steps, /mermaid_render.+revision-bound SVG/iu);
  assert.match(steps, /Independently review the fresh whole-figure SVG.+semantic completeness.+icon clarity.+labels.+branch semantics.+manifest disclosure/iu);
  assert.match(steps, /At most one bounded revision.+unchanged artifacts are not re-reviewed/iu);
  assert.match(steps, /Deliver Mermaid source.+revision-bound SVG.+manifest.+render evidence.+limitations.+asset provenance/iu);

  assert.equal(workflow.delegation.length, 8);
  assert.match(delegation, /step-2: designer owns the semantic blueprint/iu);
  assert.match(delegation, /step-3: task prepares and validates icon assets/iu);
  assert.match(delegation, /step-4: visioner independently and read-only reviews fresh asset previews/iu);
  assert.match(delegation, /step-5: designer authors the Mermaid source/iu);
  assert.match(delegation, /step-6: task calls mermaid_render/iu);
  assert.match(delegation, /step-7: visioner independently and read-only reviews the fresh current-revision SVG/iu);
  assert.match(delegation, /step-8: designer applies supported findings, task rerenders, and visioner reviews only fresh rerenders/iu);
  assert.match(delegation, /step-9: task delivers the Mermaid source/iu);

  assert.match(scope, /Mermaid source is the editable source.+SVG.+render evidence.+not an authoring surface/iu);
  assert.match(scope, /OpenTikZ.+read-only source/iu);
  assert.match(scope, /imagegen.+only when explicitly authorized/iu);
  assert.match(scope, /deterministic offline fixed-command pipeline.+shell escape disabled/iu);
  assert.match(scope, /No gate.+router.+fork.+loop.+bounded and advisory/iu);
  assert.match(scope, /visioner review is independent and read-only.+does not render.+edit.+decide completion/iu);

  assert.match(quality, /semantic completeness.+Mermaid source.+edit-contract.+revision-bound SVG.+independent visual review/iu);
  assert.doesNotMatch(`${steps} ${scope} ${delegation}`, /retry until|repeat until|automatic repair|automatic retry|block:\s*true|continue:\s*true/iu);
});

test('diagram.mermaid composes with the same independent language, slide, and design work as diagram.tikz', () => {
  const mermaid = workflowCatalog['diagram.mermaid'];
  const tikz = workflowCatalog['diagram.tikz'];

  assert.deepEqual(mermaid.composeWith, [
    'design.visual',
    'slides.generate',
    'slides.modify',
    'writing.zh',
    'writing.en',
  ]);
  assert.deepEqual(mermaid.composeWith, tikz.composeWith);
  for (const id of ['writing.zh', 'writing.en', 'slides.generate', 'slides.modify', 'design.visual']) {
    assert.equal(workflowCatalog[id].composeWith.includes('diagram.mermaid'), true, id);
    assert.equal(workflowCatalog[id].composeWith.includes('diagram.tikz'), true, id);
  }
  const latex = workflowCatalog['writing.latex'];
  assert.equal(latex.composeWith.includes('diagram.mermaid'), false);
  assert.equal(latex.composeWith.includes('diagram.tikz'), false);
  assert.match(
    `${latex.chooseWhen} ${latex.scopeNotes.join(' ')}`,
    /TikZ or Mermaid figure source alone selects diagram\.tikz or diagram\.mermaid/iu,
  );
});

test('workflow Skill routes academic figures to diagram.mermaid by default and TikZ only on explicit request', () => {
  const index = buildWorkflowSkillIndexMarkdown();
  const reference = buildWorkflowSkillReferenceMarkdown('diagram.mermaid');
  const tikz = workflowCatalog['diagram.tikz'];

  assert.match(
    index,
    /Academic figure.+flowchart.+architecture.+decision flow.+deploy pipeline.+`diagram\.mermaid`/iu,
  );
  assert.match(index, /explicit editable TikZ.+`diagram\.tikz`/iu);
  assert.match(
    index,
    /Standalone slide or explicit-TikZ request stays specialized Primary; academic diagrams default to diagram\.mermaid/iu,
  );
  assert.match(tikz.chooseWhen, /explicitly requested via TikZ or LaTeX source/iu);
  assert.match(tikz.chooseWhen, /default to diagram\.mermaid/iu);

  assert.match(
    index,
    /#### specialized outputs[\s\S]*`slides\.generate`[\s\S]*`slides\.modify`[\s\S]*`diagram\.mermaid`[\s\S]*`diagram\.tikz`/iu,
  );
  assert.match(
    index,
    /`diagram\.mermaid`[^\n]*D=\[`skill:\/\/mermaid-diagram`, `skill:\/\/svg-flowchart`\][^\n]*PLAN URI/iu,
  );
  assert.match(reference, /# `diagram\.mermaid` workflow reference/iu);
  assert.match(reference, /Agent candidates: `designer`, `task`, `visioner`/iu);
  assert.doesNotMatch(reference, /automatic retry|retry until|repeat until|automatic repair/iu);
  assert.doesNotMatch(index, /standalone SVG.*Primary|Direct standalone SVG/iu);
});
