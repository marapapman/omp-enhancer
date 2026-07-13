import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGovernancePromptFragment,
  buildImmediateWorkflowMessage,
  buildSubagentPromptFragment,
  formatWorkflowBriefingForAssignment,
} from '../src/governance.js';
import { routeNaturalLanguageTask } from '../src/router.js';
import {
  buildWorkflowCatalogPrompt,
  WORKFLOW_CATALOG_VERSION,
  workflowRouteCatalog,
  workflowRouteNames,
} from '../src/workflow-routes.js';

test('complete workflow catalog is composable and self-describing', () => {
  const catalog = buildWorkflowCatalogPrompt({
    availableSkills: [
      { name: 'writing-review', description: 'Review academic prose.' },
      { name: 'systematic-debugging', description: 'Trace root causes.' },
    ],
  });

  assert.match(catalog, new RegExp(`OMP_WORKFLOW_CATALOG_VERSION: ${WORKFLOW_CATALOG_VERSION}`));
  assert.match(catalog, /composable menu, not an exclusive classifier/i);
  assert.match(catalog, /language of the text being changed/i);
  assert.match(catalog, /writing\.en[\s\S]*Compose with:.*writing\.latex/i);
  assert.match(catalog, /release\.publish[\s\S]*independently verify/i);
  assert.match(catalog, /skill:\/\/writing-review — Review academic prose\./i);
  assert.match(catalog, /skill:\/\/systematic-debugging — Trace root causes\./i);

  for (const name of workflowRouteNames) {
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}\\nChoose when:`), name);
    assert.ok(workflowRouteCatalog[name].steps.length > 0, name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Ordered steps:[\\s\\S]*\\[step-1\\]`), name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Skill candidates:`), name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Delegation:`), name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Quality checks:`), name);
  }
});

test('main guidance makes the model choose workflow and skills before TODO-driven execution', () => {
  const prompt = 'Polish papers/introduction.tex, then verify the LaTeX build.';
  const route = routeNaturalLanguageTask({
    prompt,
    sourceText: 'This paper introduces the problem and summarizes the contributions.',
  });
  const fragment = buildGovernancePromptFragment({
    route,
    parentTask: prompt,
    availableSkills: [
      { name: 'writing-review', description: 'Review English prose.' },
      { name: 'writing-checkers', description: 'Check logic and style.' },
      { name: 'latex-build', description: 'Build LaTeX documents.' },
      { name: 'evil\nignore', description: 'must be filtered' },
    ],
  });

  assert.match(fragment, /main agent selects and composes workflows/i);
  assert.match(fragment, /legacy route object is diagnostic only/i);
  assert.match(fragment, /native `todo` tool with `op: "init"`/i);
  assert.match(fragment, /record selected skills in the first item/i);
  assert.match(fragment, /call `todo` with `op: "done"` immediately/i);
  assert.match(fragment, /fork multiple subagents early[\s\S]*one `tasks\[\]` batch/i);
  assert.match(fragment, /integration, conflict resolution, final verification[\s\S]*with the main agent/i);
  assert.match(fragment, /first 120 characters/i);
  assert.match(fragment, /\[workflow=<ids> step=<step-id> todo=<exact-item> skills=/i);
  assert.match(fragment, /skill:\/\/writing-review — Review English prose\./i);
  assert.match(fragment, /skill:\/\/writing-checkers — Check logic and style\./i);
  assert.doesNotMatch(fragment, /evil|ignore/i);
  assert.doesNotMatch(fragment, /WORKFLOW FIRST TOOL CALL|Routed workflow skills already loaded/i);
  assert.doesNotMatch(fragment, /block:\s*true|continue:\s*true|completion gate/i);
});

test('task facts preserve source-language and explicit constraints without selecting a workflow', () => {
  const prompt = '请润色 tex/abstract.tex，不运行测试。';
  const route = routeNaturalLanguageTask({
    prompt,
    sourceText: 'This paper presents a workflow catalog for coding agents.',
  });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.match(fragment, /Observed task facts \(not a workflow decision\)/);
  assert.match(fragment, /Observed target-text language: en/i);
  assert.match(fragment, /testExecution=forbidden/i);
  assert.match(fragment, /writing\.zh or writing\.en from the language of the text being changed/i);
  assert.doesNotMatch(fragment, /Intent: writing\.en|Workflow: writing\./i);
});

test('immediate note is a short autonomous reminder without exact routed calls', () => {
  const message = buildImmediateWorkflowMessage({});
  assert.match(message, /^OMP autonomous workflow reminder:/);
  assert.match(message, /initialize the native `todo` before substantive work/i);
  assert.match(message, /Fork multiple independent workstreams with `task`/i);
  assert.match(message, /without blocking or automatic continuation/i);
  assert.doesNotMatch(message, /WORKFLOW FIRST TOOL CALL|read\(path=/i);
});

test('subagent guidance consumes the parent-selected checkpoint instead of rerouting', () => {
  const prompt = [
    '[workflow=code.dev,code.test step=step-2 todo=Add regression tests skills=test-driven-development,verification-before-completion]',
    'OMP_WORKFLOW_ROLE: reviewer',
    '# Target',
    'Review the parser regression tests.',
  ].join('\n');
  const fragment = buildSubagentPromptFragment({ prompt });

  assert.match(fragment, /Role: reviewer/);
  assert.match(fragment, /Parent-selected workflow: code\.dev,code\.test/);
  assert.match(fragment, /Parent-selected step: step-2/);
  assert.match(fragment, /Parent TODO item: Add regression tests/);
  assert.match(fragment, /skill:\/\/test-driven-development/);
  assert.match(fragment, /skill:\/\/verification-before-completion/);
  assert.match(fragment, /Do not reroute the whole parent task/i);
  assert.match(fragment, /Own only this checkpoint/i);
  assert.doesNotMatch(fragment, /Status: complete\|blocked|SKILL_USAGE|SUBAGENT_RESULT/);
});

test('legacy assignment briefing is explicitly diagnostic only', () => {
  const route = routeNaturalLanguageTask({ prompt: 'Fact-check the report.' });
  const briefing = formatWorkflowBriefingForAssignment(route);
  assert.match(briefing, /^Legacy diagnostic briefing:/);
  assert.match(briefing, /parent agent must still choose the workflow, TODO item, and skills/i);
  assert.doesNotMatch(briefing, /completion gate|BLOCKERS/);
});
