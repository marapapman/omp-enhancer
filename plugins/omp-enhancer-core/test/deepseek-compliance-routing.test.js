import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  describeNaturalLanguageTask,
  normalizeTaskDescriptor,
} from '../src/task-descriptor.js';
import { routeNaturalLanguageTask } from '../src/router.js';

const fixtures = JSON.parse(await readFile(
  new URL('./fixtures/deepseek-compliance-matrix.json', import.meta.url),
  'utf8',
));

test('normalization keeps writing source targets independent from write scope', () => {
  const descriptor = normalizeTaskDescriptor({
    operation: 'inspect',
    domains: ['writing', 'document'],
    constraints: { workspaceWrite: 'forbidden' },
    workspaceWriteTargets: ['should-not-survive.tex'],
    writingSourceTargets: ['章节/第一章/引言.tex', '章节/第一章/引言.tex'],
    writingTaskKind: 'review',
    phases: [{ kind: 'inspect', domain: 'writing' }, { kind: 'review', domain: 'writing' }],
  });

  assert.deepEqual(descriptor.writingSourceTargets, ['章节/第一章/引言.tex']);
  assert.deepEqual(descriptor.workspaceWriteTargets, []);
  assert.equal(descriptor.writingTaskKind, 'review');
  assert.equal(descriptor.constraints.workspaceWrite, 'forbidden');
  assert.equal(descriptor.capabilities.includes('fs.write'), false);
  assert.equal(descriptor.risk.flags.includes('workspace-write'), false);
});

test('real DeepSeek failures compile to descriptor-policy routes in observe and enforce', async (t) => {
  for (const fixture of fixtures) {
    await t.test(fixture.id, () => {
      const descriptor = describeNaturalLanguageTask({ prompt: fixture.prompt });
      assert.equal(descriptor.operation, fixture.expectedOperation);
      assert.deepEqual(descriptor.domains, fixture.expectedDomains);
      assert.deepEqual(descriptor.writingSourceTargets, fixture.expectedSourceTargets);
      assert.equal(descriptor.writingTaskKind, fixture.expectedWritingTaskKind);
      if (fixture.expectedNetworkAccess) {
        assert.equal(descriptor.constraints.networkAccess, fixture.expectedNetworkAccess);
      }
      if (fixture.expectedTestExecution) {
        assert.equal(descriptor.constraints.testExecution, fixture.expectedTestExecution);
      }

      const observe = routeNaturalLanguageTask({ prompt: fixture.prompt, routerMode: 'observe' });
      const enforce = routeNaturalLanguageTask({ prompt: fixture.prompt, routerMode: 'enforce' });
      assert.equal(observe.intent, fixture.expectedIntent);
      assert.equal(enforce.intent, fixture.expectedIntent);
      assert.equal(observe.workflowRoute, fixture.expectedWorkflow);
      assert.equal(enforce.workflowRoute, fixture.expectedWorkflow);
      assert.ok(observe.routeObservation, 'observe keeps the compatibility comparison');
      assert.equal(observe.routeObservation.plannedIntent, fixture.expectedIntent);
      assert.equal(
        observe.routeObservation.effectiveResourceSource,
        fixture.expectedEffectiveSource ?? 'descriptor-policy',
      );
      assert.equal(enforce.routeObservation, null);
      assert.deepEqual(observe.routePlan, enforce.routePlan);
      if (fixture.expectedIntent === 'planning' && fixture.expectedDomains.includes('tests')) {
        assert.ok(observe.routePlan.skills.includes('ai-regression-testing'));
        assert.equal(observe.routePlan.tools.some((tool) => /^omp_test_/.test(tool)), false);
      }
    });
  }
});

test('source-text refinement chooses review skills without converter leakage', () => {
  const english = routeNaturalLanguageTask({
    prompt: 'Review "papers/Main Draft/abstract.tex" for academic English logic and clarity; do not modify files.',
    sourceText: 'This paper presents a careful evaluation of the proposed workflow and its limitations.',
    routerMode: 'observe',
  });
  assert.equal(english.intent, 'writing.en');
  assert.equal(english.taskDescriptor.writingTaskKind, 'review');
  assert.ok(english.routePlan.skills.includes('writing-review'));
  assert.ok(!english.routePlan.skills.includes('writing-markdown-helper'));
  assert.ok(!english.routePlan.skills.some((skill) => skill.startsWith('format-')));

  const chinese = routeNaturalLanguageTask({
    prompt: '只读检查第5章-合并正文.md的中文逻辑和行文，不要修改文件。',
    sourceText: '本章系统分析路由策略的设计、实现与实验结果，并讨论其局限性。',
    routerMode: 'observe',
  });
  assert.equal(chinese.intent, 'writing.zh');
  assert.ok(chinese.routePlan.skills.includes('plain-chinese-writing'));
  assert.ok(chinese.routePlan.skills.includes('zh-writing-review'));
  assert.ok(!chinese.routePlan.skills.includes('zh-writing-polish'));
  assert.ok(!chinese.routePlan.skills.some((skill) => skill.startsWith('format-')));
});

test('requests for text-backed writing advice do not become fact checks', () => {
  const prompt = '请只读审查 tex/abstract.tex 的英文论证逻辑、学术表达和清晰度。先按项目与 OMP 工作流读取最小适用 skill，只给出有文本证据的建议，不修改文件，不联网。';
  const pending = routeNaturalLanguageTask({ prompt, routerMode: 'observe' });
  assert.equal(pending.intent, 'writing.pending');
  assert.equal(pending.workflowRoute, 'writing.latex');

  const refined = routeNaturalLanguageTask({
    prompt,
    sourceText: 'This paper presents a careful evaluation and explicitly discusses the limitations.',
    routerMode: 'observe',
  });
  assert.equal(refined.intent, 'writing.en');
  assert.ok(refined.routePlan.skills.includes('writing-review'));
  assert.ok(!refined.routePlan.skills.includes('fact-checking'));
});

test('short document logic reviews wait for source language and never load converters', () => {
  for (const prompt of [
    '只读审查 tex/abstract.tex 的英文逻辑，不修改文件。',
    'Review tex/abstract.tex for English logic; do not modify files.',
  ]) {
    const pending = routeNaturalLanguageTask({ prompt, routerMode: 'observe' });
    assert.equal(pending.intent, 'writing.pending', prompt);
    assert.equal(pending.taskDescriptor.writingTaskKind, 'review', prompt);
    assert.deepEqual(pending.taskDescriptor.writingSourceTargets, ['tex/abstract.tex'], prompt);
    assert.ok(!pending.routePlan.skills.some((skill) => skill.startsWith('format-')), prompt);

    const refined = routeNaturalLanguageTask({
      prompt,
      sourceText: 'This abstract presents the argument and explains its limitations.',
      routerMode: 'observe',
    });
    assert.equal(refined.intent, 'writing.en', prompt);
    assert.ok(refined.routePlan.skills.includes('writing-review'), prompt);
    assert.ok(!refined.routePlan.skills.some((skill) => skill.startsWith('format-')), prompt);
  }
});

test('the autolearn threshold fixture remains a no-skill data read', () => {
  const prompt = '依次读取当前目录中的 1.txt、2.txt、3.txt、4.txt、5.txt，各读取一次，然后按文件名逐行返回读取到的值。这些随机值不具有长期意义；不要创建或修改文件。';
  const descriptor = describeNaturalLanguageTask({ prompt });
  const route = routeNaturalLanguageTask({ prompt, routerMode: 'observe' });
  assert.equal(descriptor.operation, 'answer');
  assert.equal(descriptor.domains.includes('writing'), false);
  assert.deepEqual(route.routePlan.skills, []);
});

test('Chinese path suffixes remain source targets for natural polish requests', () => {
  const route = routeNaturalLanguageTask({
    prompt: '只读评估第5章-合并正文.md开头第一段，并给出克制的中文润色稿。保留所有限定、否定、数字、引用和作者语气，不修改文件，不联网。',
    sourceText: '本章通常只讨论已经验证的结论，并不能据此推导出更强的主张。',
    routerMode: 'observe',
  });
  assert.deepEqual(route.taskDescriptor.writingSourceTargets, ['第5章-合并正文.md']);
  assert.equal(route.intent, 'writing.zh');
  assert.ok(route.routePlan.skills.includes('plain-chinese-writing'));
  assert.ok(route.routePlan.skills.includes('zh-writing-polish'));
});

test('a broad read-only English review adds checkers without conversion skills', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Review the full paper in papers/main.tex for academic English logic, structure, and clarity; do not modify files.',
    sourceText: 'This manuscript describes the complete system, evaluation, limitations, and related work in detail.',
    routerMode: 'observe',
  });
  assert.equal(route.intent, 'writing.en');
  assert.equal(route.taskDescriptor.writingTaskKind, 'review');
  assert.equal(route.taskDescriptor.complexity, 'broad');
  assert.ok(route.routePlan.skills.includes('writing-review'));
  assert.ok(route.routePlan.skills.includes('writing-checkers'));
  assert.ok(!route.routePlan.skills.some((skill) => skill.startsWith('format-')));
});

test('polish and explicit conversions receive only task-appropriate writing resources', () => {
  const polish = routeNaturalLanguageTask({
    prompt: 'Polish papers/abstract.tex for clarity.',
    sourceText: 'This paper presents an advisory workflow router.',
    routerMode: 'observe',
  });
  assert.equal(polish.taskDescriptor.writingTaskKind, 'polish');
  assert.ok(polish.routePlan.skills.includes('writing-markdown-helper'));
  assert.ok(!polish.routePlan.skills.includes('writing-review'));
  assert.ok(!polish.routePlan.skills.includes('writing-checkers'));
  assert.ok(!polish.routePlan.skills.some((skill) => skill.startsWith('format-')));

  const toLatex = routeNaturalLanguageTask({
    prompt: 'Convert notes.md to LaTeX.',
    routerMode: 'observe',
  });
  assert.equal(toLatex.taskDescriptor.writingTaskKind, 'convert');
  assert.ok(toLatex.routePlan.skills.includes('format-markdown2latex'));
  assert.ok(!toLatex.routePlan.skills.includes('format-latex2markdown'));
  assert.ok(!toLatex.routePlan.skills.includes('format-template-latex'));

  const toMarkdown = routeNaturalLanguageTask({
    prompt: 'Convert paper.tex to Markdown.',
    routerMode: 'observe',
  });
  assert.ok(toMarkdown.routePlan.skills.includes('format-latex2markdown'));
  assert.ok(!toMarkdown.routePlan.skills.includes('format-markdown2latex'));

  const template = routeNaturalLanguageTask({
    prompt: 'Apply the ACM LaTeX template to paper.tex.',
    routerMode: 'observe',
  });
  assert.ok(template.routePlan.skills.includes('format-template-latex'));
  assert.ok(!template.routePlan.skills.includes('format-markdown2latex'));
});

test('fact-check routes never inherit source-format converters', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Fact-check claims in chapters/intro.tex. Do not browse.',
    routerMode: 'observe',
  });
  assert.equal(route.intent, 'fact-check');
  assert.equal(route.workflowRoute, 'factcheck.document');
  assert.ok(route.routePlan.skills.includes('fact-checking'));
  assert.ok(!route.routePlan.skills.some((skill) => skill.startsWith('format-')));
  assert.equal(route.routePlan.tools.some((tool) => /browser|web/i.test(tool)), false);
});

test('legacy mode remains an exact projection rollback while observe keeps its comparison', () => {
  const prompt = '为修复 agent fleet 路由问题制定实现和测试计划，不要修改文件。';
  const legacy = routeNaturalLanguageTask({ prompt, routerMode: 'legacy' });
  const observe = routeNaturalLanguageTask({ prompt, routerMode: 'observe' });
  assert.equal(legacy.intent, 'writing.zh');
  assert.equal(legacy.routeObservation, null);
  assert.equal(observe.intent, 'planning');
  assert.equal(observe.routeObservation.legacyIntent, 'writing.zh');
  assert.equal(observe.routeObservation.plannedIntent, 'planning');
});

test('double-negative browsing remains affirmative', () => {
  for (const prompt of [
    'Do not skip browsing; fact-check the claims online.',
    'Do not avoid web browsing; fact-check this document online.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
  }
});
