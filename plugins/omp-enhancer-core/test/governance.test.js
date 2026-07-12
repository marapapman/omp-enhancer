import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildGovernancePromptFragment,
  buildImmediateWorkflowMessage,
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

test('governance front-loads an existing project skill path before project inspection', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'omp-governance-project-skill-'));
  try {
    const skillDir = path.join(root, 'skills', 'superpowers-writing-plans');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, 'SKILL.md'), [
      '---',
      'name: superpowers-writing-plans',
      'description: Project planning workflow',
      '---',
      '# Planning',
    ].join('\n'));

    const prompt = '为修复 agent-fleet 路由问题制定实现和测试计划，不修改文件，不运行测试。';
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    const fragment = buildGovernancePromptFragment({ route, parentTask: prompt, workspaceRoot: root });

    assert.match(fragment, /### Start with the workflow skill/);
    assert.match(fragment, /Primary skill to read now: `skills\/superpowers-writing-plans\/SKILL\.md`/);
    assert.ok(fragment.indexOf('### Start with the workflow skill') < fragment.indexOf('### Suggested steps'));
    assert.match(fragment, /workflow guidance, not a tool authorization or completion gate/i);
    assert.match(fragment, /### Immediate next action[\s\S]*PREFERRED NEXT TOOL: read\(path="skills\/superpowers-writing-plans\/SKILL\.md"\)/);
    assert.match(fragment, /correct the target at most once[\s\S]*continue the user task/i);
    assert.ok(fragment.trimEnd().endsWith('otherwise proceed with the user request using the available evidence.'));
    const message = buildImmediateWorkflowMessage({ route, workspaceRoot: root });
    assert.match(message, /^OMP advisory workflow note for this turn:/);
    assert.match(message, /PREFERRED NEXT TOOL: read\(path="skills\/superpowers-writing-plans\/SKILL\.md"\)/);
    assert.match(message, /never block tools or completion/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('review guidance requires one verbatim evidence check and one user-visible deliverable', () => {
  const prompt = 'Read-only review of sections/5.7.md for Chinese argument flow and academic wording.';
  const route = routeNaturalLanguageTask({
    prompt,
    sourceText: '本文讨论自动化安全测试的研究进展。',
    routerMode: 'enforce',
  });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.match(fragment, /quoted passage.*verbatim.*successful read/is);
  assert.match(fragment, /check every quoted phrase and location once before the final response/i);
  assert.match(fragment, /one user-visible deliverable/i);
  assert.match(fragment, /advisor-only continuation.*no user-visible text or tools/i);
  assert.match(fragment, /PREFERRED NEXT TOOL: read\(path="skill:\/\/plain-chinese-writing"\)/);
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
    if (fragment.includes('### Immediate next action')) {
      assert.match(fragment, /never block tools or completion/i, prompt);
      assert.match(fragment, /after a second failure[\s\S]*continue the user task/i, prompt);
    }
  }
});

test('pending writing guidance asks for body inspection before language skills', () => {
  const route = routeNaturalLanguageTask({ prompt: '请润色 tex/abstract.tex。', routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask: '请润色 tex/abstract.tex。' });
  assert.equal(route.intent, 'writing.pending');
  assert.match(fragment, /Writing language is pending content inspection/);
  assert.match(fragment, /language of the surrounding instruction is not evidence/i);
  assert.doesNotMatch(fragment, /skill:\/\/(?:plain-chinese-writing|zh-writing-polish|writing-markdown-helper)/);
  assert.equal(buildImmediateWorkflowMessage({ route }), '');
});

test('turn-local planning and diagnosis guidance preserves user read-only budgets', () => {
  const planningPrompt = '为修复 agent-fleet 路由问题制定实现和测试计划，不修改文件，不运行测试。在 8 次以内的读取或搜索后交付计划。';
  const planningRoute = routeNaturalLanguageTask({ prompt: planningPrompt, routerMode: 'enforce' });
  const planning = buildImmediateWorkflowMessage({ route: planningRoute, parentTask: planningPrompt });
  assert.match(planning, /total inspection budget of 8 read\/search calls/i);
  assert.match(planning, /each call inside a parallel batch counts separately/i);
  assert.match(planning, /never queue a batch larger than the remaining budget/i);
  assert.match(planning, /SERIAL INSPECTION MODE:[\s\S]*at most ONE read\/search tool call in each assistant message/i);
  assert.match(planning, /Do not issue parallel read, grep, or glob calls/i);
  assert.match(planning, /response-only plan/i);
  assert.match(planning, /do not reopen a root-cause investigation[\s\S]*search \.pi\/specs[\s\S]*load a diagnosis skill/i);
  assert.match(planning, /do not encode shell, git, test, or task commands as read selectors/i);

  const diagnosisPrompt = '诊断 src/router.test.mjs 的路由失配，不修改文件、不运行测试，最多 8 次读取或搜索。';
  const diagnosisRoute = routeNaturalLanguageTask({ prompt: diagnosisPrompt, routerMode: 'enforce' });
  const diagnosis = buildImmediateWorkflowMessage({ route: diagnosisRoute, parentTask: diagnosisPrompt });
  assert.equal(diagnosisRoute.intent, 'diagnosis');
  assert.match(diagnosis, /static diagnosis only/i);
  assert.match(diagnosis, /overrides generic debugging steps/i);
  assert.match(diagnosis, /total inspection budget of 8 read\/search calls/i);
  assert.match(diagnosis, /SERIAL INSPECTION MODE/i);
});

test('natural inspection routes receive advisory convergence targets without hard gates', () => {
  const factPrompt = '核查 sections/5.7.md 中三个事实是否有本地引文支持，只使用工作区证据，不联网。';
  const factRoute = routeNaturalLanguageTask({ prompt: factPrompt, routerMode: 'enforce' });
  const fact = buildImmediateWorkflowMessage({ route: factRoute, parentTask: factPrompt });
  assert.equal(factRoute.intent, 'fact-check');
  assert.match(fact, /Advisory workflow convergence target:[\s\S]*within 8 read\/search calls/i);
  assert.match(fact, /target guides scope and does not block any tool call/i);
  assert.match(fact, /SERIAL INSPECTION MODE/i);

  const auditPrompt = '只读审计 extensions/agent-fleet 的任务路由与失败收敛逻辑，读取 exact debugging skill，不修改文件、不运行测试。';
  const auditRoute = routeNaturalLanguageTask({ prompt: auditPrompt, routerMode: 'enforce' });
  const audit = buildImmediateWorkflowMessage({ route: auditRoute, parentTask: auditPrompt });
  assert.equal(auditRoute.intent, 'bug-audit');
  assert.match(audit, /Advisory workflow convergence target:[\s\S]*within 12 read\/search calls/i);
  assert.match(audit, /SERIAL INSPECTION MODE/i);
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
