import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGovernancePromptFragment,
  buildSubagentPromptFragment,
  formatWorkflowBriefingForAssignment,
} from '../src/governance.js';
import { routeNaturalLanguageTask } from '../src/router.js';

test('governance emits advisory skills, steps, roles, checks, and risk notes', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Fix the parser bug and run focused tests.',
    routerMode: 'enforce',
  });
  const fragment = buildGovernancePromptFragment({ route, parentTask: 'Fix the parser bug and run focused tests.' });
  assert.match(fragment, /Workflow Guidance/);
  assert.match(fragment, /This guidance is advisory/);
  assert.match(fragment, /Suggested steps/);
  assert.match(fragment, /Relevant skills/);
  assert.match(fragment, /Useful tools/);
  assert.match(fragment, /Optional roles/);
  assert.match(fragment, /Quality checks/);
  assert.match(fragment, /Scope and risk notes/);
  assert.match(fragment, /Advisor guidance/);
});

test('governance asks for one exact minimal skill read and bounded evidence-driven work', () => {
  const prompt = 'Audit the router and report concrete bugs without modifying files.';
  const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.match(fragment, /Before substantive work, read exactly the smallest directly applicable primary skill once/);
  assert.match(fragment, /exact project-specified skill.*exact routed URI.*inventory-confirmed equivalent/i);
  assert.match(fragment, /successful read of its SKILL\.md/i);
  assert.match(fragment, /one targeted correction/i);
  assert.match(fragment, /Do not invent aliases.*retry unchanged calls/i);
  assert.match(fragment, /6 to 8 read or search calls/i);
  assert.match(fragment, /partial result/i);
  assert.match(fragment, /dispatch an asynchronous task once/i);
  assert.match(fragment, /gate-satisfy.*gate-unblock/i);
  assert.doesNotMatch(fragment, /Skill use is flexible/);
});

test('advisor guidance consumes evidence deltas once without reopening completed work', () => {
  const prompt = 'Review src/router.js and report findings.';
  const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.match(fragment, /advisor notes as evidence deltas/i);
  assert.match(fragment, /each distinct material point once/i);
  assert.match(fragment, /does not justify rereading skills.*rerunning unchanged tools.*second final answer/is);
  assert.match(fragment, /concrete newly evidenced correction/i);
});

test('governance never creates a hard-stop or completion evidence contract', () => {
  for (const prompt of [
    'Publish the plugin release.',
    'Audit this authentication module for vulnerabilities.',
    'Only run test/router.test.js without network access.',
    '请润色 tex/abstract.tex。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });
    assert.doesNotMatch(fragment, /Execution boundary: blocked|gate is still open|Mandatory Skill Workflow|runtime enforces|Final routed outputs must include/i, prompt);
    assert.doesNotMatch(fragment, /SKILL_USAGE|SUBAGENT_USAGE|SUBAGENT_RESULT|REVIEW_EVIDENCE|SECURITY_REVIEW/, prompt);
  }
});

test('pending writing guidance asks for body inspection before language skills', () => {
  const route = routeNaturalLanguageTask({ prompt: '请润色 tex/abstract.tex。', routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask: '请润色 tex/abstract.tex。' });
  assert.equal(route.intent, 'writing.pending');
  assert.match(fragment, /Writing language is pending content inspection/);
  assert.match(fragment, /language of the surrounding instruction is not evidence/i);
  assert.doesNotMatch(fragment, /skill:\/\/(?:plain-chinese-writing|zh-writing-polish|writing-markdown-helper)/);
});

test('document preservation is a quality suggestion rather than an execution boundary', () => {
  const prompt = '只做文风润色，保持所有事实不变；修改 docs/paper.md。';
  const route = routeNaturalLanguageTask({ prompt, sourceText: '本文的数值是 42。', routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });
  assert.match(fragment, /preserving subjects, predicates, values, polarity, quantifiers/i);
  assert.match(fragment, /before-and-after read/i);
  assert.doesNotMatch(fragment, /blocked before tool use|split the work into one exact document/i);
});

test('subagent prompt provides optional role skills without a closing evidence template', () => {
  const prompt = [
    'OMP_WORKFLOW_ROLE: writer',
    'Workflow briefing:',
    'Parent workflow: writing.en',
    'Suggested skills for this role:',
    '- writing-markdown-helper',
  ].join('\n');
  const fragment = buildSubagentPromptFragment({ prompt });
  assert.match(fragment, /Role: writer/);
  assert.match(fragment, /Suggested skills for this role/);
  assert.match(fragment, /skill:\/\/writing-markdown-helper/);
  assert.match(fragment, /Missing skills are a limitation to report/);
  assert.match(fragment, /read exactly the smallest directly applicable primary skill once/i);
  assert.match(fragment, /one targeted correction/i);
  assert.doesNotMatch(fragment, /Final subagent output must end with|Status: complete\|blocked|SKILL_USAGE|SUBAGENT_RESULT/);
});

test('assignment briefing is a workflow summary rather than a parent completion contract', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Fact-check the supplied report using independent evidence.',
    routerMode: 'enforce',
  });
  const briefing = formatWorkflowBriefingForAssignment(route);
  assert.match(briefing, /^Workflow briefing:/);
  assert.match(briefing, /Suggested parent steps:/);
  assert.match(briefing, /contributes one checkpoint/);
  assert.doesNotMatch(briefing, /completion gates|Do not claim|BLOCKERS/);
});
