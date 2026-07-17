import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGovernancePromptFragment,
  buildImmediateWorkflowMessage,
  buildSubagentPromptFragment,
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
  assert.match(catalog, /composable menu, not a router or required execution protocol/i);
  assert.match(catalog, /language of the text being changed/i);
  assert.match(catalog, /writing\.en[\s\S]*Compose with:.*writing\.latex/i);
  assert.match(catalog, /### writing\.zh[\s\S]*Optional delegation ideas:\n- step-2: zh-writer owns[\s\S]*\n- step-3: zh-checker independently reviews/i);
  assert.match(catalog, /### writing\.en[\s\S]*Optional delegation ideas:\n- step-2: writer owns[\s\S]*\n- step-3: checker independently reviews/i);
  assert.match(catalog, /### writing\.pending[\s\S]*before the body language is observed, do not delegate to writer, checker, zh-writer, or zh-checker/i);
  assert.match(catalog, /### diagram\.svg[\s\S]*Optional delegation ideas:\n- step-2: designer creates[\s\S]*\n- step-4: visioner independently reviews/i);
  assert.match(catalog, /### slides\.generate[\s\S]*Optional delegation ideas:\n- step-7: designer owns the final layout pass[\s\S]*\n- step-10: visioner independently reviews/i);
  assert.match(catalog, /### slides\.modify[\s\S]*Optional delegation ideas:\n- step-5: designer owns the bounded final layout pass[\s\S]*\n- step-8: visioner independently reviews/i);
  assert.match(catalog, /### research\.web[\s\S]*Compose with: factcheck\.document[\s\S]*Optional delegation ideas:\n- step-2: fact-planner defines[\s\S]*\n- step-3: fact-researcher-a and fact-researcher-b search independent source lanes/i);
  assert.match(catalog, /### code\.test[\s\S]*Optional delegation ideas:\n- step-2: test-planner produces[\s\S]*\n- step-3: test-executor owns[\s\S]*\n- step-5: test-reviewer independently audits/i);
  assert.match(catalog, /release\.publish[\s\S]*independently verify/i);
  assert.match(catalog, /skill:\/\/writing-review — Review academic prose\./i);
  assert.match(catalog, /skill:\/\/systematic-debugging — Trace root causes\./i);

  for (const name of workflowRouteNames) {
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}\\nChoose when:`), name);
    assert.ok(workflowRouteCatalog[name].steps.length > 0, name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Ordered steps:[\\s\\S]*\\[step-1\\]`), name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Skill candidates:`), name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Optional agent candidates:`), name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Optional delegation ideas:`), name);
    assert.match(catalog, new RegExp(`### ${name.replace('.', '\\.')}[\\s\\S]*Quality checks:`), name);
  }
});

test('explicit main guidance preserves OMP authority and presents workflows as optional data', () => {
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

  assert.match(fragment, /explicit and optional/i);
  assert.match(fragment, /OMP's system prompt, current settings[\s\S]*remain authoritative/i);
  assert.match(fragment, /workflow card never requires a TODO/i);
  assert.match(fragment, /Let OMP decide whether and how to use TODOs or subagents/i);
  assert.match(fragment, /dynamic Available Agents list/i);
  assert.match(fragment, /Agent candidates are non-exclusive suggestions/i);
  assert.match(fragment, /skill:\/\/writing-review — Review English prose\./i);
  assert.match(fragment, /skill:\/\/writing-checkers — Check logic and style\./i);
  assert.doesNotMatch(fragment, /evil|skill:\/\/ignore/i);
  assert.doesNotMatch(fragment, /FIRST tool call|before any project read|fork multiple subagents early/i);
  assert.doesNotMatch(fragment, /Invoke only roles listed/i);
  assert.doesNotMatch(fragment, /block:\s*true|continue:\s*true|required completion gate/i);
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

test('task facts preserve explicit write targets and exclusions without creating permissions', () => {
  const prompt = '只修改 源码/，不要修改 测试/、测试夹具/。';
  const route = routeNaturalLanguageTask({ prompt });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.match(fragment, /Observed targets: 源码\//i);
  assert.match(fragment, /Observed write exclusions: 测试\/, 测试夹具\//i);
  assert.doesNotMatch(fragment, /Observed targets:[^\n]*(?:测试\/|测试夹具\/)/i);
  assert.match(fragment, /observed task facts only/i);
  assert.match(fragment, /permissions[\s\S]*remain authoritative/i);
});

test('immediate note is optional information and never directs native orchestration', () => {
  const message = buildImmediateWorkflowMessage({
    availableSkills: [{ name: 'writing-review' }, { name: 'systematic-debugging' }],
  });
  assert.match(message, /^OMP Enhancer optional workflow reference:/);
  assert.match(message, /No automatic action is required/i);
  assert.match(message, /system prompt, current settings[\s\S]*remain authoritative/i);
  assert.match(message, /Currently visible skill candidates: writing-review, systematic-debugging/);
  assert.match(message, /does not require loading any skill/i);
  assert.doesNotMatch(message, /FIRST tool call|initialize the native `todo`|Fork multiple/i);
});

test('subagent metadata remains optional and defers to the native assignment', () => {
  const prompt = [
    '[workflow=code.dev,code.test step=step-2 todo=Add regression tests skills=test-driven-development,verification-before-completion]',
    'OMP_WORKFLOW_ROLE: reviewer',
    '# Target',
    'Review the parser regression tests.',
  ].join('\n');
  const fragment = buildSubagentPromptFragment({ prompt });

  assert.match(fragment, /Observed role label: reviewer/);
  assert.match(fragment, /Observed workflow label: code\.dev,code\.test/);
  assert.match(fragment, /Observed step label: step-2/);
  assert.match(fragment, /Observed TODO label: Add regression tests/);
  assert.match(fragment, /skill:\/\/test-driven-development/);
  assert.match(fragment, /skill:\/\/verification-before-completion/);
  assert.match(fragment, /OMP-provided subagent system prompt, assignment[\s\S]*authoritative/i);
  assert.match(fragment, /informational only/i);
  assert.doesNotMatch(fragment, /Load the exact parent-selected skills|Own only this checkpoint/i);
  assert.doesNotMatch(fragment, /Status: complete\|blocked|SKILL_USAGE|SUBAGENT_RESULT/);
});
