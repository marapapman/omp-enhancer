import test from 'node:test';
import assert from 'node:assert/strict';

import { routeNaturalLanguageTask } from '../src/router.js';

const FORBIDDEN_SIDE_EFFECTS = {
  testExecution: 'forbidden',
  networkAccess: 'forbidden',
  externalWrite: 'forbidden',
  subagents: 'forbidden',
};

test('Chinese clause separators preserve every explicit negative constraint', () => {
  const route = routeNaturalLanguageTask({
    prompt: '修复 src/router.js 中的 bug，但不要运行测试、不要联网、不要使用 subagent、不要发布',
  });

  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.deepEqual(route.taskDescriptor.constraints, {
    workspaceWrite: 'required',
    ...FORBIDDEN_SIDE_EFFECTS,
  });
  assert.equal(route.taskDescriptor.complexity, 'focused');
  assert.deepEqual(route.requiredSubagents, []);
  assert.equal(route.taskDescriptor.phases.some((phase) => phase.kind === 'release'), false);
});

test('strong Chinese prohibition words preserve every explicit negative constraint', () => {
  for (const prompt of [
    '只读审查 src/router.js。禁止修改任何文件，禁止运行测试，禁止联网，禁止启动 subagent，禁止提交或发布。仅使用读取类工具，最后报告发现。',
    '只读审查 src/router.js。不得修改任何文件，不得运行测试，不得联网，不得启动 subagent，不得提交或发布。仅使用读取类工具，最后报告发现。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.taskDescriptor.operation, 'inspect', prompt);
    assert.deepEqual(route.taskDescriptor.constraints, {
      workspaceWrite: 'forbidden',
      ...FORBIDDEN_SIDE_EFFECTS,
    }, prompt);
    assert.deepEqual(route.routePlan.requiredTools, [], prompt);
    assert.equal(
      route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'),
      false,
      prompt,
    );
  }
});

test('a strong prohibition on other files preserves the explicitly requested write target', () => {
  const route = routeNaturalLanguageTask({
    prompt: '修复 src/parser.js 中 parse 函数，只做最小修改。禁止修改任何其他文件，禁止运行测试，禁止联网，禁止启动 subagent，禁止提交或发布。',
    routerMode: 'enforce',
  });

  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['src/parser.js']);
  assert.deepEqual(route.taskDescriptor.constraints, {
    workspaceWrite: 'required',
    ...FORBIDDEN_SIDE_EFFECTS,
  });
  assert.deepEqual(route.routePlan.phases, [
    { kind: 'inspect', domain: 'code' },
    { kind: 'modify', domain: 'code' },
    { kind: 'review', domain: 'code' },
  ]);
});

test('a global no-write prohibition wins over a bounded other-files clause', () => {
  for (const prompt of [
    '修复 src/parser.js。禁止修改任何文件，也禁止修改任何其他文件。',
    'Fix src/parser.js. Do not modify any files, and do not modify any other files.',
    '修复 src/parser.js。不要修改文件，也不要修改其他文件。',
    'Fix src/parser.js. Do not modify files; do not modify other files.',
    '只读分析并给出修复 src/parser.js 的方案；禁止修改任何其他文件。',
    'Read-only: explain how to fix src/parser.js; do not modify any other files.',
    '只报告 src/parser.js 的问题；不要修改任何其他文件。',
    'Report findings for src/parser.js only; do not modify any other files.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(route.taskDescriptor.operation, 'inspect', prompt);
    assert.ok(!route.routePlan.phases.some(({ kind }) => kind === 'modify'), prompt);
    assert.ok(!route.taskDescriptor.capabilities.includes('fs.write'), prompt);
  }
});

test('a bounded English document polish uses English writing skills despite a Chinese instruction', () => {
  const route = routeNaturalLanguageTask({
    prompt: '润色 docs/notes.md 的标题和英文句子，保持事实 42 不变。只修改 docs/notes.md；禁止修改其他文件，禁止运行测试，禁止联网，禁止启动 subagent，禁止提交或发布。',
    routerMode: 'enforce',
  });
  assert.equal(route.intent, 'writing.en');
  assert.equal(route.workflowRoute, 'writing.en');
  assert.deepEqual(route.taskDescriptor.domains, ['writing', 'document']);
  assert.ok(route.requiredSkills.includes('writing-markdown-helper'));
  assert.ok(!route.requiredSkills.includes('writing-checkers'));
  assert.ok(!route.requiredSkills.includes('zh-writing-polish'));
  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['docs/notes.md']);
  assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.deepEqual(route.routePlan.requiredSubagents, []);
  assert.ok(!route.routePlan.requiredTools.some((tool) => /^omp_test_/i.test(tool)));
});

test('a negative English reference does not override an explicit Chinese writing target', () => {
  const route = routeNaturalLanguageTask({
    prompt: '润色 docs/notes.md 的中文段落，不要改英文引用。只修改 docs/notes.md；禁止运行测试和发布。',
    routerMode: 'enforce',
  });
  assert.equal(route.intent, 'writing.zh');
  assert.equal(route.taskDescriptor.language, 'zh');
  assert.deepEqual(route.taskDescriptor.domains, ['writing', 'document']);
  assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.ok(!route.requiredSkills.includes('writing-checkers'));
});

test('writing target language is symmetric and shared across legacy and descriptor projections', () => {
  for (const prompt of [
    'Please polish this Chinese paragraph.',
    'Polish this paragraph in Chinese.',
    'Please polish this Chinese paragraph, but do not change the English quotation.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.intent, 'writing.zh', prompt);
    assert.equal(route.workflowRoute, 'writing.zh', prompt);
    assert.equal(route.taskDescriptor.language, 'zh', prompt);
    assert.ok(route.requiredSkills.includes('plain-chinese-writing'), prompt);
    assert.ok(!route.requiredSkills.includes('writing-markdown-helper'), prompt);
  }

  const english = routeNaturalLanguageTask({
    prompt: '请润色下面的英文句子，使表达自然。',
    routerMode: 'enforce',
  });
  assert.equal(english.intent, 'writing.en');
  assert.equal(english.taskDescriptor.language, 'en');
  assert.ok(english.requiredSkills.includes('writing-markdown-helper'));
  assert.ok(!english.requiredSkills.includes('zh-writing-polish'));
});

test('English compound fixes preserve no-test, no-network, no-subagent, and no-release ceilings', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Fix the bug in src/router.js, but do not run tests, use the network, use subagents, or publish.',
  });

  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.deepEqual(route.taskDescriptor.domains, ['code']);
  assert.deepEqual(route.taskDescriptor.constraints, {
    workspaceWrite: 'required',
    ...FORBIDDEN_SIDE_EFFECTS,
  });
  assert.equal(route.taskDescriptor.phases.some((phase) => phase.kind === 'release'), false);
});

test('an exact test-file command remains execute-only under explicit side-effect ceilings', () => {
  for (const prompt of [
    '只运行 plugins/omp-enhancer-core/test/router.test.js，不要修改文件、不要联网、不要使用 subagent、不要发布',
    'Only run node --test plugins/omp-enhancer-core/test/router.test.js; do not modify files, use the network, use subagents, or publish.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });
    assert.equal(route.taskDescriptor.operation, 'execute', prompt);
    assert.deepEqual(route.taskDescriptor.domains, ['tests'], prompt);
    assert.equal(route.intent, 'testing', prompt);
    assert.equal(route.workflowRoute, 'code.test', prompt);
    assert.deepEqual(route.taskDescriptor.constraints, {
      workspaceWrite: 'forbidden',
      testExecution: 'required',
      networkAccess: 'forbidden',
      externalWrite: 'forbidden',
      subagents: 'forbidden',
    }, prompt);
    assert.deepEqual(route.taskDescriptor.testExecutionTargets, [
      'plugins/omp-enhancer-core/test/router.test.js',
    ], prompt);
    assert.deepEqual(route.routePlan.requiredSkills, [], prompt);
    assert.equal(route.taskDescriptor.phases.some((phase) => phase.kind === 'release'), false, prompt);
  }
});

test('a complete multi-file exact test request stays bounded to its ordered target list', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Only run node --test test/router.test.js test/governance.test.js; do not modify files, use the network, use subagents, or publish.',
    routerMode: 'enforce',
  });

  assert.equal(route.taskDescriptor.operation, 'execute');
  assert.deepEqual(route.taskDescriptor.domains, ['tests']);
  assert.equal(route.intent, 'testing');
  assert.equal(route.workflowRoute, 'code.test');
  assert.deepEqual(route.taskDescriptor.testExecutionTargets, [
    'test/router.test.js',
    'test/governance.test.js',
  ]);
  assert.deepEqual(route.taskDescriptor.constraints, {
    workspaceWrite: 'forbidden',
    testExecution: 'required',
    networkAccess: 'forbidden',
    externalWrite: 'forbidden',
    subagents: 'forbidden',
  });
  assert.deepEqual(route.routePlan.requiredSkills, []);
  assert.deepEqual(route.routePlan.requiredTools, []);
  assert.deepEqual(route.routePlan.gateRequirements, [{ key: 'test-evidence', mode: 'required' }]);
});

test('one Chinese prohibition marker scopes across a compact side-effect list', () => {
  const route = routeNaturalLanguageTask({
    prompt: '只运行 test/router.test.js 并报告结果。禁止修改文件、联网、启动 subagent 或发布。',
    routerMode: 'enforce',
  });
  assert.equal(route.taskDescriptor.operation, 'execute');
  assert.deepEqual(route.taskDescriptor.domains, ['tests']);
  assert.deepEqual(route.taskDescriptor.testExecutionTargets, ['test/router.test.js']);
  assert.deepEqual(route.taskDescriptor.constraints, {
    workspaceWrite: 'forbidden',
    testExecution: 'required',
    networkAccess: 'forbidden',
    externalWrite: 'forbidden',
    subagents: 'forbidden',
  });
});

test('forbidden tests and publishing do not create positive task domains', () => {
  const route = routeNaturalLanguageTask({
    prompt: '只回答这个问题，不要运行测试，不要发布。',
    routerMode: 'enforce',
  });
  assert.equal(route.intent, 'unknown');
  assert.equal(route.workflowRoute, 'agentic.simple');
  assert.deepEqual(route.taskDescriptor.domains, ['general']);
  assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden');
});

test('a compact Chinese bare prohibition applies to both tests and publishing', () => {
  const route = routeNaturalLanguageTask({
    prompt: '只回答这个问题，不运行测试和发布。',
    routerMode: 'enforce',
  });
  assert.equal(route.intent, 'unknown');
  assert.equal(route.workflowRoute, 'agentic.simple');
  assert.deepEqual(route.taskDescriptor.domains, ['general']);
  assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.notEqual(route.taskDescriptor.constraints.networkAccess, 'required');
});

test('an exact test target does not erase a second review or publish action', () => {
  const review = routeNaturalLanguageTask({
    prompt: 'Run test/router.test.js and review src/router.js for bugs.',
    routerMode: 'enforce',
  });
  assert.equal(review.intent, 'bug-audit');
  assert.equal(review.workflowRoute, 'code.review');
  assert.equal(review.taskDescriptor.operation, 'inspect');
  assert.deepEqual(review.taskDescriptor.domains, ['code', 'tests']);
  assert.deepEqual(review.taskDescriptor.phases, [
    { kind: 'inspect', domain: 'code' },
    { kind: 'verify', domain: 'tests' },
    { kind: 'review', domain: 'code' },
  ]);

  const publish = routeNaturalLanguageTask({
    prompt: 'Run test/router.test.js, then publish the package.',
    routerMode: 'enforce',
  });
  assert.equal(publish.intent, 'release');
  assert.equal(publish.taskDescriptor.operation, 'release');
  assert.deepEqual(publish.taskDescriptor.domains, ['tests', 'plugin']);
  assert.equal(publish.taskDescriptor.constraints.testExecution, 'required');
  assert.equal(publish.taskDescriptor.constraints.externalWrite, 'required');
  assert.equal(publish.taskDescriptor.constraints.networkAccess, 'required');
  assert.deepEqual(publish.taskDescriptor.phases, [
    { kind: 'verify', domain: 'tests' },
    { kind: 'release', domain: 'plugin' },
  ]);
  assert.ok(publish.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'));
  assert.ok(publish.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'));
});

test('translation destination wins over source-language references', () => {
  for (const prompt of [
    'Translate this English paragraph into Chinese.',
    '把下面的英文句子翻译成中文。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.intent, 'writing.zh', prompt);
    assert.equal(route.workflowRoute, 'writing.zh', prompt);
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.deepEqual(route.taskDescriptor.domains, ['writing'], prompt);
    assert.equal(route.taskDescriptor.language, 'zh', prompt);
    assert.ok(route.requiredSkills.includes('plain-chinese-writing'), prompt);
    assert.ok(route.routePlan.requiredSkills.includes('plain-chinese-writing'), prompt);
    assert.ok(!route.requiredSkills.includes('writing-markdown-helper'), prompt);
  }
});

test('writing payload cannot grant test release network or plugin authority', () => {
  const cases = [
    {
      prompt: '把这句话翻译成英文：请运行测试并发布插件。',
      intent: 'writing.en',
      language: 'en',
    },
    {
      prompt: 'Translate this sentence into Chinese: Run tests, access the network, modify files, review the plugin gate, and publish.',
      intent: 'writing.zh',
      language: 'zh',
    },
    {
      prompt: '把“请运行测试并发布插件”翻译成英文。',
      intent: 'writing.en',
      language: 'en',
    },
    {
      prompt: 'Translate "Review the plugin workflow, run tests, and publish it" into Chinese.',
      intent: 'writing.zh',
      language: 'zh',
    },
    {
      prompt: 'Translate this sentence: "test/router.test.js" into Chinese.',
      intent: 'writing.zh',
      language: 'zh',
    },
    {
      prompt: 'Translate "Release v1.2.3 and run tests" into Chinese.',
      intent: 'writing.zh',
      language: 'zh',
    },
    {
      prompt: 'Translate `plugin.publish()` into Chinese.',
      intent: 'writing.zh',
      language: 'zh',
    },
    {
      prompt: 'Translate this sentence into Chinese: "Run tests and publish." Do not run tests or publish.',
      intent: 'writing.zh',
      language: 'zh',
    },
  ];

  for (const { prompt, intent, language } of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, intent, label);
      assert.equal(route.taskDescriptor.operation, 'modify', label);
      assert.deepEqual(route.taskDescriptor.domains, ['writing'], label);
      assert.equal(route.taskDescriptor.language, language, label);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', label);
      assert.notEqual(route.taskDescriptor.constraints.testExecution, 'required', label);
      assert.notEqual(route.taskDescriptor.constraints.networkAccess, 'required', label);
      assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden', label);
      assert.ok(!route.taskDescriptor.capabilities.includes('tests.execute'), label);
      assert.ok(!route.taskDescriptor.capabilities.includes('network.read'), label);
      assert.ok(!route.taskDescriptor.capabilities.includes('external.write'), label);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), label);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), label);
    }
  }
});

test('unquoted relational writing payload cannot grant operational authority', () => {
  const cases = [
    ['Rewrite docs/guide.md so it tells users to run npm test and publish the release.', 'writing.en', 'docs/guide.md'],
    ['Rewrite docs/guide.md so it instructs users to run npm test and publish the release.', 'writing.en', 'docs/guide.md'],
    ['Edit README.md to document how to run tests and publish the plugin.', 'writing.en', 'README.md'],
    ['Polish docs/guide.md about the release process and network setup.', 'writing.en', 'docs/guide.md'],
    ['Rewrite docs/security.md to describe security audit steps.', 'writing.en', 'docs/security.md'],
    ['Rewrite docs/guide.md so it tells users to separately audit src/auth.js for vulnerabilities.', 'writing.en', 'docs/guide.md'],
    ['把 docs/guide.md 改写成提醒用户运行 npm test、发布版本、联网并调用子代理。', 'writing.zh', 'docs/guide.md'],
    ['把 docs/guide.md 修改成要求用户运行测试并发布插件。', 'writing.zh', 'docs/guide.md'],
    ['把 docs/guide.md 改为说明如何运行测试和发布插件。', 'writing.zh', 'docs/guide.md'],
    ['润色 docs/release-notes.md，让文案说明如何运行测试和发布插件。', 'writing.zh', 'docs/release-notes.md'],
    ['编辑 docs/security.md 以描述安全审计步骤。', 'writing.zh', 'docs/security.md'],
  ];

  for (const [prompt, intent, target] of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, intent, label);
      assert.equal(route.workflowRoute, intent, label);
      assert.equal(route.taskDescriptor.operation, 'modify', label);
      assert.deepEqual(route.taskDescriptor.domains, ['writing', 'document'], label);
      assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, [target], label);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', label);
      assert.notEqual(route.taskDescriptor.constraints.testExecution, 'required', label);
      assert.notEqual(route.taskDescriptor.constraints.networkAccess, 'required', label);
      assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden', label);
      assert.ok(!route.taskDescriptor.phases.some(({ kind }) => kind === 'release'), label);
      assert.ok(!route.requiredTools.some((tool) => /^omp_test_/i.test(tool)), label);
      assert.ok(!route.requiredSubagents.some(({ agent }) => ['plan', 'implementation-task', 'reviewer'].includes(agent)), label);
    }
  }
});

test('independent actions after writing payload remain explicitly authorized', () => {
  const cases = [
    ['Rewrite docs/guide.md to say hello. Then run npm test and publish the plugin.', 'writing.en'],
    ['Rewrite docs/guide.md so it says tests are required. Then actually run npm test and publish the plugin.', 'writing.en'],
    ['Polish docs/guide.md, then run npm test and publish the plugin.', 'writing.en'],
    ['润色 docs/guide.md，让文案说明安装步骤。然后运行测试并发布插件。', 'writing.zh'],
    ['润色 docs/guide.md，并运行测试、发布插件。', 'writing.zh'],
  ];

  for (const [prompt, intent] of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, intent, label);
      assert.equal(route.workflowRoute, intent, label);
      assert.equal(route.taskDescriptor.operation, 'modify', label);
      assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['docs/guide.md'], label);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', label);
      assert.equal(route.taskDescriptor.constraints.testExecution, 'required', label);
      assert.equal(route.taskDescriptor.constraints.networkAccess, 'required', label);
      assert.equal(route.taskDescriptor.constraints.externalWrite, 'required', label);
      assert.ok(route.taskDescriptor.phases.some(({ kind }) => kind === 'modify'), label);
      assert.ok(route.taskDescriptor.phases.some(({ kind }) => kind === 'release'), label);
      assert.ok(route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), label);
      assert.ok(route.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), label);
      assert.ok(route.requiredTools.includes('omp_test_gate'), label);
      assert.ok(!route.requiredSubagents.some(({ agent }) => ['ecc-tdd-guide', 'plan', 'implementation-task'].includes(agent)), label);
    }
  }
});

test('punctuated independent actions after writing payload remain outside the payload', () => {
  const cases = [
    {
      prompt: 'Polish README.md to say do not push. Separately, push the release.',
      intent: 'writing.en',
      testExecution: 'unspecified',
      externalWrite: 'required',
      requiredPhase: 'release',
    },
    {
      prompt: '把这段文字改写成‘不要运行测试’，然后单独运行单元测试。',
      intent: 'writing.zh',
      testExecution: 'required',
      externalWrite: 'forbidden',
      requiredPhase: 'verify',
    },
  ];

  for (const item of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode });
      const label = `${routerMode}: ${item.prompt}`;
      assert.equal(route.intent, item.intent, label);
      assert.equal(route.taskDescriptor.constraints.testExecution, item.testExecution, label);
      assert.equal(route.taskDescriptor.constraints.externalWrite, item.externalWrite, label);
      assert.ok(route.taskDescriptor.phases.some(({ kind }) => kind === item.requiredPhase), label);
    }
  }
});

test('an independent security audit after a writing payload keeps both workflows aligned', () => {
  for (const [prompt, expectedTargets] of [
    ['Rewrite docs/guide.md to mention security. Separately audit src/auth.js for vulnerabilities.', ['docs/guide.md']],
    ['Rewrite the docs and audit the auth code; do not run tests.', []],
    ['Rewrite docs/guide.md and separately audit src/auth.js for vulnerabilities.', ['docs/guide.md']],
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, 'security-review', label);
      assert.equal(route.workflowRoute, 'security.review', label);
      assert.equal(route.taskDescriptor.operation, 'modify', label);
      assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, expectedTargets, label);
      assert.ok(route.taskDescriptor.domains.includes('writing'), label);
      assert.ok(route.taskDescriptor.domains.includes('security'), label);
      assert.ok(route.taskDescriptor.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'writing'), label);
      assert.ok(!route.taskDescriptor.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), label);
      assert.ok(route.requiredSkills.includes('writing-markdown-helper'), label);
      assert.ok(route.requiredSkills.includes('security-review'), label);
      assert.ok(route.requiredSubagents.some(({ agent }) => agent === 'writer'), label);
      assert.ok(route.requiredSubagents.some(({ agent }) => agent === 'ecc-security-reviewer'), label);
      assert.ok(!route.requiredSubagents.some(({ agent }) => agent === 'implementation-task'), label);
      assert.ok(route.routePlan.gateRequirements.some(({ key }) => key === 'security-evidence'), label);
      assert.ok(route.routePlan.gateRequirements.some(({ key }) => key === 'writing-quality'), label);
    }
  }
});

test('shared English and Chinese negations apply to later write and code-review actions', () => {
  for (const prompt of [
    'Fix the parser; do not run tests or modify files.',
    '修复 parser，不运行测试或修改文件。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'inspect', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden', prompt);
    assert.equal(route.taskDescriptor.capabilities.includes('fs.write'), false, prompt);
    assert.equal(route.routePlan.phases.some(({ kind }) => ['modify', 'create'].includes(kind)), false, prompt);
  }

  for (const prompt of [
    'Write a report; do not run tests or inspect code.',
    '写一份报告，不要运行测试或检查代码。',
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.ok(['writing.en', 'writing.zh'].includes(route.intent), label);
      assert.deepEqual(route.taskDescriptor.domains, ['writing'], label);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', label);
      assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden', label);
      assert.equal(route.routePlan.phases.some(({ domain }) => domain === 'code'), false, label);
    }
  }
});

test('specialized document and visual creation descriptors carry their required local-write phases', () => {
  const docx = routeNaturalLanguageTask({
    prompt: '根据这些要点生成一个 Word docx 报告，带标题和目录。',
    routerMode: 'enforce',
  });
  assert.equal(docx.workflowRoute, 'doc.convert.word');
  assert.equal(docx.taskDescriptor.operation, 'create');
  assert.equal(docx.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.ok(docx.taskDescriptor.capabilities.includes('fs.write'));
  assert.ok(docx.routePlan.phases.some(({ kind, domain }) => kind === 'create' && domain === 'document'));

  const latex = routeNaturalLanguageTask({
    prompt: '把 paper.md 转成 LaTeX，保留公式、引用和图表占位；不运行测试。',
    routerMode: 'enforce',
  });
  assert.equal(latex.workflowRoute, 'writing.latex');
  assert.equal(latex.taskDescriptor.operation, 'modify');
  assert.equal(latex.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.equal(latex.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.ok(latex.taskDescriptor.capabilities.includes('fs.write'));
  assert.ok(latex.routePlan.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'writing'));

  const visual = routeNaturalLanguageTask({
    prompt: 'Create a polished React dashboard visual design with intentional spacing, color, and hierarchy.',
    routerMode: 'enforce',
  });
  assert.equal(visual.intent, 'design.visual');
  assert.equal(visual.workflowRoute, 'design.visual');
  assert.equal(visual.taskDescriptor.operation, 'create');
  assert.equal(visual.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.ok(visual.taskDescriptor.capabilities.includes('fs.write'));
  assert.ok(visual.routePlan.phases.some(({ kind, domain }) => kind === 'create' && domain === 'visual'));
  assert.ok(visual.requiredSkills.includes('frontend-design'));
});

test('bare Chinese no-test clauses preserve specialized document workflows', () => {
  const prompt = '把 report.tex 转成 Markdown，保留标题层级，不运行测试。';
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode });
    assert.equal(route.intent, 'writing.zh', routerMode);
    assert.equal(route.workflowRoute, 'writing.latex', routerMode);
    assert.equal(route.taskDescriptor.operation, 'modify', routerMode);
    assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden', routerMode);
    assert.ok(route.requiredSkills.includes('format-latex2markdown'), routerMode);
  }
});

test('Unicode apostrophes preserve shared prohibitions without activating quoted writing payloads', () => {
  const constrained = routeNaturalLanguageTask({
    prompt: 'Fix the parser; don’t run tests or modify files, use subagents, access the network, or publish.',
    routerMode: 'enforce',
  });
  assert.equal(constrained.taskDescriptor.operation, 'inspect');
  assert.deepEqual(constrained.taskDescriptor.constraints, {
    workspaceWrite: 'forbidden',
    testExecution: 'forbidden',
    networkAccess: 'forbidden',
    externalWrite: 'forbidden',
    subagents: 'forbidden',
  });
  assert.equal(constrained.taskDescriptor.capabilities.includes('fs.write'), false);

  for (const routerMode of ['observe', 'enforce']) {
    const payload = routeNaturalLanguageTask({
      prompt: 'Rewrite docs/guide.md so it says “Users don’t run tests or modify files.”',
      routerMode,
    });
    assert.deepEqual(payload.taskDescriptor.workspaceWriteTargets, ['docs/guide.md'], routerMode);
    assert.equal(payload.taskDescriptor.constraints.workspaceWrite, 'required', routerMode);
    assert.notEqual(payload.taskDescriptor.constraints.testExecution, 'forbidden', routerMode);
  }
});

test('visual polish and edit requests compile as writable visual modifications', () => {
  for (const [prompt, testExecution] of [
    ['Polish this React component visually and improve the responsive layout.', 'unspecified'],
    ['Polish the dashboard visuals: improve spacing and colors; do not run tests.', 'forbidden'],
    ['Edit the visual layout of src/Dashboard.tsx; do not run tests.', 'forbidden'],
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, 'design.visual', label);
      assert.equal(route.workflowRoute, 'design.visual', label);
      assert.equal(route.taskDescriptor.operation, 'modify', label);
      assert.ok(route.taskDescriptor.domains.includes('visual'), label);
      assert.equal(route.taskDescriptor.domains.includes('writing'), false, label);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', label);
      assert.equal(route.taskDescriptor.constraints.testExecution, testExecution, label);
      assert.ok(route.taskDescriptor.capabilities.includes('fs.write'), label);
      assert.ok(route.routePlan.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'visual'), label);
      assert.equal(route.routePlan.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'writing'), false, label);
      assert.ok(route.requiredSkills.includes('frontend-design'), label);
    }
  }
});

test('functional UI construction stays code development while prose style stays focused writing', () => {
  for (const prompt of [
    '写个页面',
    '请写一个用户看板，包含统计数字和最近活动。',
    'Create a React dashboard with charts and tables.',
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      assert.equal(route.intent, 'implementation-with-tests', `${routerMode}: ${prompt}`);
      assert.equal(route.workflowRoute, 'code.dev', `${routerMode}: ${prompt}`);
      assert.equal(route.taskDescriptor.domains.includes('visual'), false, `${routerMode}: ${prompt}`);
    }
  }

  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({
      prompt: 'Revise the paper introduction and improve style.',
      routerMode,
    });
    assert.equal(route.intent, 'writing.en', routerMode);
    assert.deepEqual(route.taskDescriptor.domains, ['writing'], routerMode);
    assert.equal(route.taskDescriptor.complexity, 'focused', routerMode);
    assert.deepEqual(route.requiredSubagents, [], routerMode);
  }
});

test('docx creation stays on the document route without manufacturing code authority', () => {
  for (const prompt of [
    'Create a Word docx report from these notes.',
    'Create a Word docx report from these notes; do not run tests.',
    '根据这些要点生成一个 Word docx 报告，带标题和目录。',
    '根据这些要点生成一个 Word docx 报告，带标题和目录，不运行测试。',
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, 'doc.convert.word', label);
      assert.equal(route.workflowRoute, 'doc.convert.word', label);
      assert.equal(route.taskDescriptor.operation, 'create', label);
      assert.ok(route.taskDescriptor.domains.includes('document'), label);
      assert.equal(route.taskDescriptor.domains.includes('code'), false, label);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', label);
      assert.ok(route.taskDescriptor.capabilities.includes('fs.write'), label);
      assert.ok(route.routePlan.phases.some(({ kind, domain }) => kind === 'create' && domain === 'document'), label);
      assert.equal(route.requiredSkills.some((skill) => ['brainstorming', 'test-driven-development', 'subagent-driven-development'].includes(skill)), false, label);
    }
  }
});

test('Chinese relational writing payload does not revoke its target but trailing constraints still do', () => {
  for (const routerMode of ['observe', 'enforce']) {
    const payload = routeNaturalLanguageTask({
      prompt: '改写 docs/guide.md，说明为什么我们不运行测试或修改文件。',
      routerMode,
    });
    assert.deepEqual(payload.taskDescriptor.workspaceWriteTargets, ['docs/guide.md'], routerMode);
    assert.equal(payload.taskDescriptor.constraints.workspaceWrite, 'required', routerMode);
    assert.notEqual(payload.taskDescriptor.constraints.testExecution, 'forbidden', routerMode);
    assert.deepEqual(payload.taskDescriptor.domains, ['writing', 'document'], routerMode);

    const constrained = routeNaturalLanguageTask({
      prompt: '改写 docs/guide.md，说明原因；然后不运行测试或修改文件。',
      routerMode,
    });
    assert.equal(constrained.taskDescriptor.constraints.workspaceWrite, 'forbidden', routerMode);
    assert.equal(constrained.taskDescriptor.constraints.testExecution, 'forbidden', routerMode);
    assert.equal(constrained.taskDescriptor.capabilities.includes('fs.write'), false, routerMode);
  }
});

test('real plugin document instructions retain plugin document and release semantics', () => {
  for (const prompt of [
    '润色 plugins/example/README.md 的 OMP 路由说明并发布。',
    'Polish the plugin README and publish it.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.ok(route.taskDescriptor.domains.includes('writing'), prompt);
    assert.ok(route.taskDescriptor.domains.includes('document'), prompt);
    assert.ok(route.taskDescriptor.domains.includes('plugin'), prompt);
    assert.equal(route.taskDescriptor.constraints.externalWrite, 'required', prompt);
    assert.equal(route.taskDescriptor.constraints.networkAccess, 'required', prompt);
    assert.ok(route.taskDescriptor.phases.some(({ kind }) => kind === 'release'), prompt);
    assert.ok(route.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), prompt);
  }

  for (const [prompt, target] of [
    ['润色 "docs/notes.md" 的插件路由说明并发布。', 'docs/notes.md'],
    ['Rewrite `README.md` for the plugin and publish it.', 'README.md'],
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, [target], prompt);
    assert.ok(route.taskDescriptor.domains.includes('document'), prompt);
    assert.ok(route.taskDescriptor.domains.includes('plugin'), prompt);
    assert.equal(route.taskDescriptor.constraints.externalWrite, 'required', prompt);
    assert.ok(route.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), prompt);
  }

  const quotedPayloadThenRelease = routeNaturalLanguageTask({
    prompt: 'Polish: "ordinary prose". Then publish the plugin.',
    routerMode: 'enforce',
  });
  assert.ok(quotedPayloadThenRelease.taskDescriptor.domains.includes('writing'));
  assert.ok(quotedPayloadThenRelease.taskDescriptor.domains.includes('plugin'));
  assert.equal(quotedPayloadThenRelease.taskDescriptor.constraints.externalWrite, 'required');
  assert.ok(quotedPayloadThenRelease.taskDescriptor.phases.some(({ kind }) => kind === 'release'));
  assert.ok(quotedPayloadThenRelease.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'));
});

test('writing target filenames cannot grant release or plugin authority', () => {
  for (const [prompt, target, intent] of [
    ['Polish "publish.md".', 'publish.md', 'writing.en'],
    ['Polish publish.md.', 'publish.md', 'writing.en'],
    ['Polish "release-notes.md".', 'release-notes.md', 'writing.en'],
    ['Polish release-notes.md.', 'release-notes.md', 'writing.en'],
    ['Polish the wording in publish.md.', 'publish.md', 'writing.en'],
    ['Polish the wording in release-notes.md.', 'release-notes.md', 'writing.en'],
    ['Polish the wording in docs/release-notes.md.', 'docs/release-notes.md', 'writing.en'],
    ['Polish the wording of docs/release-notes.md.', 'docs/release-notes.md', 'writing.en'],
    ['For docs/release-notes.md, polish the wording.', 'docs/release-notes.md', 'writing.en'],
    ['docs/release-notes.md needs wording polish.', 'docs/release-notes.md', 'writing.en'],
    ['Polish wording (docs/release-notes.md).', 'docs/release-notes.md', 'writing.en'],
    ['Polish the wording in /tmp/docs/release-notes.md.', '/tmp/docs/release-notes.md', 'writing.en'],
    ['Please improve the wording inside docs/npm-test.md.', 'docs/npm-test.md', 'writing.en'],
    ['润色 "发布.md"。', '发布.md', 'writing.zh'],
    ['润色 发布.md。', '发布.md', 'writing.zh'],
    ['润色位于 发布.md 中的措辞。', '发布.md', 'writing.zh'],
    ['请润色一下发布.md里的措辞。', '发布.md', 'writing.zh'],
    ['润色措辞，文件是 docs/发布.md。', 'docs/发布.md', 'writing.zh'],
    ['对 docs/release-notes.md 做措辞润色。', 'docs/release-notes.md', 'writing.zh'],
    ['docs/发布.md 需要润色措辞。', 'docs/发布.md', 'writing.zh'],
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, intent, label);
      assert.equal(route.taskDescriptor.operation, 'modify', label);
      assert.deepEqual(route.taskDescriptor.domains, ['writing', 'document'], label);
      assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, [target], label);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', label);
      assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden', label);
      assert.notEqual(route.taskDescriptor.constraints.networkAccess, 'required', label);
      assert.ok(!route.taskDescriptor.phases.some(({ kind }) => kind === 'release'), label);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), label);
    }
  }
});

test('security prose refinement does not require security review or code gates', () => {
  const cases = [
    {
      prompt: 'Review the wording of this security policy draft for clarity and tone.',
      intent: 'writing.en',
      domains: ['writing'],
      targets: [],
    },
    {
      prompt: 'Polish the security wording in docs/security-policy.md for clarity and tone.',
      intent: 'writing.en',
      domains: ['writing', 'document'],
      targets: ['docs/security-policy.md'],
    },
    {
      prompt: 'Polish the security policy wording in docs/security.md; do not audit code.',
      intent: 'writing.en',
      domains: ['writing', 'document'],
      targets: ['docs/security.md'],
    },
    {
      prompt: 'Draft a security announcement for users; do not audit code.',
      intent: 'writing.en',
      domains: ['writing'],
      targets: [],
    },
    {
      prompt: '请润色这份中文安全公告的措辞和语气，不要触发代码安全审查。',
      intent: 'writing.zh',
      domains: ['writing'],
      targets: [],
    },
  ];

  for (const { prompt, intent, domains, targets } of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, intent, label);
      assert.deepEqual(route.taskDescriptor.domains, domains, label);
      assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, targets, label);
      assert.ok(!route.requiredSkills.includes('security-review'), label);
      assert.ok(!route.requiredSkills.includes('security-scan'), label);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'security-evidence'), label);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'review-evidence'), label);
      assert.ok(!route.requiredTools.some((tool) => /^omp_test_/i.test(tool)), label);
      if (route.taskDescriptor.complexity === 'focused') {
        assert.deepEqual(route.requiredTools, [], label);
        assert.deepEqual(route.requiredSubagents, [], label);
      } else {
        assert.ok(route.requiredTools.includes('writing_quality_check'), label);
        assert.ok(route.requiredSubagents.length > 0, label);
      }
    }
  }
});

test('pure read-only security audits use the security route in observe and enforce modes', () => {
  for (const prompt of [
    'Audit src/auth.js for security issues and report findings.',
    'Review the wording of the security policy for vulnerabilities.',
    'Review the security policy wording for auth bypass risks.',
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      const label = `${routerMode}: ${prompt}`;
      assert.equal(route.intent, 'security-review', label);
      assert.equal(route.workflowRoute, 'security.review', label);
      assert.equal(route.taskDescriptor.operation, 'inspect', label);
      assert.ok(route.taskDescriptor.domains.includes('security'), label);
      assert.ok(!route.taskDescriptor.domains.includes('writing'), label);
      assert.ok(route.requiredSkills.includes('security-review'), label);
      assert.ok(route.requiredSkills.includes('security-scan'), label);
      assert.ok(route.routePlan.gateRequirements.some(({ key }) => key === 'security-evidence'), label);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), label);
      assert.ok(!route.requiredTools.some((tool) => /^omp_test_/i.test(tool)), label);
      assert.ok(!route.requiredSubagents.some(({ agent }) => ['writer', 'checker', 'zh-writer', 'zh-checker'].includes(agent)), label);
    }
  }
});

test('ordinary Chinese words containing 不 do not create shared prohibitions', () => {
  const comparison = routeNaturalLanguageTask({
    prompt: '比较不同测试框架的结果并解释差异。',
    routerMode: 'enforce',
  });
  assert.notEqual(comparison.taskDescriptor.constraints.testExecution, 'forbidden');

  const coverage = routeNaturalLanguageTask({
    prompt: '分析测试覆盖不足并运行测试。',
    routerMode: 'enforce',
  });
  assert.equal(coverage.taskDescriptor.constraints.testExecution, 'required');

  const release = routeNaturalLanguageTask({
    prompt: '修复不发布版本号的问题并发布新版本。',
    routerMode: 'enforce',
  });
  assert.equal(release.taskDescriptor.constraints.externalWrite, 'required');
  assert.ok(release.taskDescriptor.phases.some(({ kind }) => kind === 'release'));
});

test('document editing can forbid code changes without freezing the requested document target', () => {
  const route = routeNaturalLanguageTask({
    prompt: '润色 README.md，但不要修改代码、不要联网、不要使用 subagent、不要发布',
  });

  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.equal(route.taskDescriptor.constraints.networkAccess, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.subagents, 'forbidden');
  assert.equal(route.taskDescriptor.phases.some((phase) => phase.kind === 'release'), false);
});

test('generic Markdown document paths are writable only at the requested target', () => {
  const route = routeNaturalLanguageTask({
    prompt: '请润色 docs/notes.md 的中文表述，保持事实不变；不要联网、不要运行测试、不要使用 subagent、不要发布',
  });

  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.equal(route.taskDescriptor.domains.includes('writing'), true);
  assert.equal(route.taskDescriptor.domains.includes('document'), true);
  assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['docs/notes.md']);
  assert.equal(route.taskDescriptor.constraints.networkAccess, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.subagents, 'forbidden');
});

test('fact and local-property constraints do not turn an authorized document edit read-only', () => {
  for (const prompt of [
    '只润色 docs/notes.md，不改事实和数字。',
    '润色 docs/notes.md，不要改 API 名称。',
    '润色 docs/notes.md 的结构，不要改文案和样式。',
    'Polish docs/notes.md, but do not change facts or API names.',
    'Edit docs/notes.md for structure; do not change its wording or style.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', prompt);
    assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['docs/notes.md'], prompt);
  }
});

test('metalinguistic preservation phrases remain ordinary writable edits', () => {
  for (const prompt of [
    'Polish docs/notes.md. The phrase ‘facts unchanged’ itself should be rewritten. Only modify docs/notes.md.',
    '润色 docs/notes.md；把“事实不变”这四个字改得更自然。只修改 docs/notes.md。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', prompt);
    assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['docs/notes.md'], prompt);
  }
});

test('multi-document preservation prompts retain every explicitly authorized target', () => {
  for (const prompt of [
    '润色 docs/a.md、docs/b.md，保持事实不变，只修改 docs/a.md、docs/b.md。',
    'Polish docs/a.md and docs/b.md; keep facts unchanged; only modify docs/a.md and docs/b.md.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', prompt);
    assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['docs/a.md', 'docs/b.md'], prompt);
  }
});

test('absolute and quoted-space document targets remain exact writable document routes', () => {
  for (const [prompt, target] of [
    ['润色 /home/dingli/Letter/main.tex，保持事实和数字不变。', '/home/dingli/Letter/main.tex'],
    ['Polish "/home/dingli/Letter/My Notes.tex" while keeping facts unchanged.', '/home/dingli/Letter/My Notes.tex'],
    ['润色 "/home/dingli/Letter/研究 说明.tex"，保持事实不变。', '/home/dingli/Letter/研究 说明.tex'],
    ['Polish "docs/My Notes.md"; facts unchanged.', 'docs/My Notes.md'],
    ['润色“docs/研究 说明.tex”，保持事实不变。', 'docs/研究 说明.tex'],
    ['润色‘docs/研究 说明.tex’，保持事实不变。', 'docs/研究 说明.tex'],
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.equal(route.taskDescriptor.domains.includes('document'), true, prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', prompt);
    assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, [target], prompt);
  }
});

test('quoted source documents and exclusions are not silently added to the write allowlist', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Polish "docs/My Notes.md" using facts from "docs/Source Notes.md", but do not modify "docs/Source Notes.md".',
    routerMode: 'enforce',
  });

  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, ['docs/My Notes.md']);
  assert.deepEqual(route.taskDescriptor.workspaceWriteExclusions, ['docs/Source Notes.md']);
  assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required');
});

test('offline fact inspection stays read-only and never turns a negated publish into release', () => {
  const route = routeNaturalLanguageTask({
    prompt: '核查 README.md 中的事实，但不要联网、不要修改、不要发布',
  });

  assert.equal(route.taskDescriptor.operation, 'inspect');
  assert.equal(route.taskDescriptor.domains.includes('facts'), true);
  assert.deepEqual(route.taskDescriptor.constraints, {
    workspaceWrite: 'forbidden',
    testExecution: 'unspecified',
    networkAccess: 'forbidden',
    externalWrite: 'forbidden',
    subagents: 'unspecified',
  });
  assert.equal(route.taskDescriptor.phases.some((phase) => phase.kind === 'release'), false);
});

test('offline repository-evidence support questions stay on the fact-check route', () => {
  const route = routeNaturalLanguageTask({
    prompt: '离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。',
    routerMode: 'enforce',
  });

  assert.equal(route.intent, 'fact-check');
  assert.equal(route.agent, 'fact-checker');
  assert.equal(route.taskDescriptor.operation, 'inspect');
  assert.equal(route.taskDescriptor.complexity, 'focused');
  assert.equal(route.taskDescriptor.domains.includes('facts'), true);
  assert.deepEqual(route.taskDescriptor.constraints, {
    workspaceWrite: 'forbidden',
    ...FORBIDDEN_SIDE_EFFECTS,
  });
  assert.deepEqual(route.routePlan.phases, [{ kind: 'inspect', domain: 'facts' }]);
  assert.deepEqual(route.routePlan.requiredSkills, []);
  assert.deepEqual(route.routePlan.requiredTools, []);
  assert.deepEqual(route.routePlan.requiredSubagents, []);
  assert.deepEqual(route.requiredSkills, []);
  assert.deepEqual(route.requiredTools, []);
  assert.deepEqual(route.requiredSubagents, []);
  assert.equal(route.shouldForkSubagents, false);
  assert.deepEqual(route.routePlan.gateRequirements, [{ key: 'fact-evidence', mode: 'required' }]);
  assert.equal(route.taskDescriptor.phases.some((phase) => phase.kind === 'release'), false);

  const observed = routeNaturalLanguageTask({
    prompt: '离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。',
    routerMode: 'observe',
  });
  assert.equal(observed.intent, 'fact-check');
  assert.deepEqual(observed.requiredSubagents, []);
  assert.equal(observed.shouldForkSubagents, false);

  const legacy = routeNaturalLanguageTask({
    prompt: '离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。',
    routerMode: 'legacy',
  });
  assert.deepEqual(legacy.requiredSkills, legacy.routePlan.requiredSkills);
  assert.deepEqual(legacy.requiredTools, legacy.routePlan.requiredTools);
  assert.deepEqual(legacy.requiredSubagents, []);
  assert.equal(legacy.shouldForkSubagents, false);
});

test('explicit no-test implementation ceilings project to every public resource field', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Fix src/parser.js but do not run tests or use subagents.',
    routerMode: 'enforce',
  });

  assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(route.taskDescriptor.constraints.subagents, 'forbidden');
  assert.deepEqual(route.requiredSkills, route.routePlan.requiredSkills);
  assert.deepEqual(route.requiredTools, route.routePlan.requiredTools);
  assert.deepEqual(route.requiredSubagents, []);
  assert.equal(route.requiredSkills.includes('test-driven-development'), false);
  assert.equal(route.requiredTools.some((tool) => tool.startsWith('omp_test_')), false);
  assert.equal(route.shouldForkSubagents, false);
});

test('focused no-test implementation stays direct and does not advertise method attempts', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Fix src/parser.js but do not run tests.',
    routerMode: 'enforce',
  });

  assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(route.requiredSkills.includes('test-driven-development'), false);
  assert.equal(route.requiredSkills.includes('ai-regression-testing'), false);
  assert.equal(route.requiredTools.some((tool) => tool.startsWith('omp_test_')), false);
  assert.deepEqual(route.requiredSubagents, []);
  assert.equal(route.shouldForkSubagents, false);
  assert.ok(route.requiredSkills.includes('verification-before-completion'));
  assert.doesNotMatch(route.routeCard, /test-driven-development|subagent-driven-development|brainstorming/);
});

test('a root README fact target does not add a writing workflow to focused offline inspection', () => {
  const route = routeNaturalLanguageTask({
    prompt: '离线核查 README.md 中 The stable identifier is X 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。',
    routerMode: 'enforce',
  });

  assert.equal(route.intent, 'fact-check');
  assert.equal(route.taskDescriptor.complexity, 'focused');
  assert.deepEqual(route.routePlan.requiredSkills, []);
  assert.deepEqual(route.routePlan.requiredTools, []);
  assert.deepEqual(route.routePlan.requiredSubagents, []);
  assert.deepEqual(route.routePlan.gateRequirements, [{ key: 'fact-evidence', mode: 'required' }]);
});

test('an English README evidence claim remains a focused fact inspection rather than writing', () => {
  const prompt = 'Offline only, inspect README.md and determine whether local evidence supports claim 42. Do not modify files, do not use subagents.';
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode });
    assert.equal(route.intent, 'fact-check', routerMode);
    assert.equal(route.taskDescriptor.operation, 'inspect', routerMode);
    assert.ok(route.taskDescriptor.domains.includes('facts'), routerMode);
    assert.equal(route.taskDescriptor.domains.includes('writing'), false, routerMode);
    assert.equal(route.taskDescriptor.complexity, 'focused', routerMode);
    assert.deepEqual(route.requiredSubagents, [], routerMode);
    assert.equal(route.requiredSkills.some((skill) => /^writing-/.test(skill)), false, routerMode);
  }
});

test('an English supported-by repository claim uses the focused single-search fact route', () => {
  const prompt = 'Offline, verify whether the README claim "The stable fact is 42" is supported by repository-local evidence. Do not modify files. Do not run tests. Do not use subagents. Do not access the network. Use at most one focused search command and conclude supported, contradicted, or insufficient.';

  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode });
    assert.equal(route.intent, 'fact-check', routerMode);
    assert.equal(route.taskDescriptor.operation, 'inspect', routerMode);
    assert.equal(route.taskDescriptor.complexity, 'focused', routerMode);
    assert.deepEqual(route.requiredSkills, [], routerMode);
    assert.deepEqual(route.requiredTools, [], routerMode);
    assert.deepEqual(route.requiredSubagents, [], routerMode);
    assert.deepEqual(route.routePlan.gateRequirements, [{ key: 'fact-evidence', mode: 'required' }], routerMode);
  }
});

test('reports from supplied findings remain response-only writing without reopening subject workflows', () => {
  const cases = [
    ['Write a code review summary from the supplied findings; do not inspect or change code.', 'writing.en'],
    ['Summarize these verified bug findings into a report; do not inspect code or run tests.', 'writing.en'],
    ['Write a test failure report from the supplied logs; do not run tests.', 'writing.en'],
    ['把已有安全审计发现整理成报告，不检查代码，不运行测试。', 'writing.zh'],
  ];
  for (const [prompt, intent] of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      assert.equal(route.intent, intent, `${routerMode}: ${prompt}`);
      assert.deepEqual(route.taskDescriptor.domains, ['writing'], `${routerMode}: ${prompt}`);
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', `${routerMode}: ${prompt}`);
      assert.equal(route.taskDescriptor.capabilities.includes('fs.write'), false, `${routerMode}: ${prompt}`);
      assert.deepEqual(route.requiredSubagents, [], `${routerMode}: ${prompt}`);
      assert.equal(route.requiredTools.some((tool) => /^(?:omp_test_|fact_check_)/.test(tool)), false, `${routerMode}: ${prompt}`);
      assert.equal(route.routePlan.gateRequirements.some(({ key }) => ['test-evidence', 'fact-evidence', 'security-evidence', 'review-evidence'].includes(key)), false, `${routerMode}: ${prompt}`);
    }
  }
});

test('negative fact and security review instructions do not reopen protected evidence gates', () => {
  const cases = [
    ['Polish this fact-check report without verifying any claims.', 'writing.en'],
    ['润色这份事实核查报告，不核验任何事实。', 'writing.zh'],
    ['Write a security report from supplied findings only; do not perform a security audit.', 'writing.en'],
    ['起草已有安全发现的报告，不要做安全审计。', 'writing.zh'],
  ];
  for (const [prompt, intent] of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      assert.equal(route.intent, intent, `${routerMode}: ${prompt}`);
      assert.deepEqual(route.taskDescriptor.domains, ['writing'], `${routerMode}: ${prompt}`);
      assert.equal(route.requiredTools.some((tool) => /^(?:fact_check_)/.test(tool)), false, `${routerMode}: ${prompt}`);
      assert.equal(route.requiredSubagents.some(({ agent }) => /^(?:fact-|ecc-security|reviewer$)/.test(agent)), false, `${routerMode}: ${prompt}`);
      assert.equal(route.routePlan.gateRequirements.some(({ key }) => ['fact-evidence', 'security-evidence'].includes(key)), false, `${routerMode}: ${prompt}`);
    }
  }
});

test('compound routes advertise every phase and gate they will enforce in observe and enforce modes', () => {
  const cases = [
    {
      prompt: 'Fix the auth bypass in src/auth.js, run tests, then publish the plugin.',
      intent: 'security-review',
      phases: ['modify:code', 'verify:tests', 'release:plugin'],
      gates: ['security-evidence', 'test-evidence', 'review-evidence', 'release-approval'],
    },
    {
      prompt: 'Fact-check the claims in docs/paper.md, then polish the prose.',
      intent: 'fact-check',
      phases: ['inspect:facts', 'modify:writing', 'review:writing'],
      gates: ['fact-evidence', 'writing-quality'],
    },
    {
      prompt: 'Run tests, then publish the plugin.',
      intent: 'release',
      phases: ['verify:tests', 'release:plugin'],
      gates: ['test-evidence', 'release-approval'],
    },
    {
      prompt: 'Run tests, write a report, then publish the plugin.',
      intent: 'writing.en',
      phases: ['verify:tests', 'modify:writing', 'release:plugin'],
      gates: ['test-evidence', 'writing-quality', 'release-approval'],
    },
  ];

  for (const item of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode });
      const label = `${routerMode}: ${item.prompt}`;
      assert.equal(route.intent, item.intent, label);
      const phases = route.routePlan.phases.map(({ kind, domain }) => `${kind}:${domain}`);
      for (const phase of item.phases) assert.ok(phases.includes(phase), `${label}: ${phase}`);
      const gates = route.routePlan.gateRequirements.map(({ key }) => key);
      for (const gate of item.gates) assert.ok(gates.includes(gate), `${label}: ${gate}`);
      assert.deepEqual(route.requiredSkills, route.routePlan.requiredSkills, `${label}: skills`);
      assert.deepEqual(route.requiredTools, route.routePlan.requiredTools, `${label}: tools`);
      assert.deepEqual(route.requiredSubagents, route.routePlan.requiredSubagents, `${label}: subagents`);
    }
  }
});

test('compound code writing, observed failures, exact test authoring, and config diagnosis keep exact route authority', () => {
  const cases = [
    {
      prompt: 'Fix the parser bug and update CHANGELOG.md. Do not run tests or use subagents.',
      intent: 'implementation-with-tests',
      operation: 'modify',
      phases: ['modify:code', 'modify:writing'],
      forbiddenGates: ['test-evidence'],
      noSubagents: true,
    },
    {
      prompt: 'Fix the auth bypass, run tests, write a security report, and push the plugin release.',
      intent: 'security-review',
      operation: 'modify',
      phases: ['modify:code', 'modify:writing', 'verify:tests', 'release:plugin'],
    },
    {
      prompt: 'Summarize these already observed E2E failures; do not rerun tests or inspect code.',
      intent: 'writing.en',
      operation: 'modify',
      domains: ['tests', 'writing'],
      phases: ['modify:writing'],
      forbiddenPhases: ['modify:code', 'verify:tests'],
      noSubagents: true,
    },
    {
      prompt: 'Add exactly one regression test for routeNaturalLanguageTask; do not modify production code.',
      intent: 'bug-audit',
      operation: 'modify',
      phases: ['verify:tests'],
      requiredReasons: ['direct test authoring requested', 'primary direct test authoring requested'],
      noSubagents: true,
    },
    {
      prompt: 'Run config doctor and diagnose missing assets; do not modify files or run tests.',
      intent: 'config-assets',
      operation: 'diagnose',
      domains: ['config'],
      phases: ['inspect:config', 'diagnose:config'],
      forbiddenPhases: ['inspect:code', 'diagnose:code'],
      noSubagents: true,
    },
  ];

  for (const item of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode });
      const label = `${routerMode}: ${item.prompt}`;
      assert.equal(route.intent, item.intent, label);
      assert.equal(route.taskDescriptor.operation, item.operation, label);
      if (item.domains) assert.deepEqual(route.taskDescriptor.domains, item.domains, label);
      const phases = route.routePlan.phases.map(({ kind, domain }) => `${kind}:${domain}`);
      for (const phase of item.phases ?? []) assert.ok(phases.includes(phase), `${label}: ${phase}`);
      for (const phase of item.forbiddenPhases ?? []) assert.equal(phases.includes(phase), false, `${label}: ${phase}`);
      const gates = route.routePlan.gateRequirements.map(({ key }) => key);
      for (const gate of item.forbiddenGates ?? []) assert.equal(gates.includes(gate), false, `${label}: ${gate}`);
      for (const reason of item.requiredReasons ?? []) assert.ok(route.taskDescriptor.provenance.reasons.includes(reason), `${label}: ${reason}`);
      if (item.noSubagents) assert.deepEqual(route.requiredSubagents, [], label);
    }
  }
});

test('primary direct test authoring is a tests-only mutation workflow in every effective router mode', () => {
  const prompts = [
    'Add exactly one regression test for routeNaturalLanguageTask; do not modify production code.',
    '写测试但不要改实现。',
  ];
  const expectedPhases = [
    { kind: 'inspect', domain: 'tests' },
    { kind: 'modify', domain: 'tests' },
    { kind: 'verify', domain: 'tests' },
    { kind: 'review', domain: 'tests' },
  ];
  for (const prompt of prompts) {
    for (const routerMode of ['observe', 'enforce']) {
      const label = `${routerMode}: ${prompt}`;
      const route = routeNaturalLanguageTask({ prompt, routerMode });
      assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', label);
      assert.equal(route.taskDescriptor.complexity, 'focused', label);
      assert.deepEqual(route.taskDescriptor.phases, expectedPhases, label);
      assert.deepEqual(route.routePlan.phases, expectedPhases, label);
      assert.equal(route.routePlan.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), false, label);
      assert.deepEqual(route.requiredSkills, [
        'test-driven-development',
        'verification-before-completion',
      ], label);
      assert.deepEqual(route.requiredTools, ['omp_test_gate'], label);
      assert.deepEqual(route.requiredSubagents, [], label);
      assert.deepEqual(route.routePlan.gateRequirements, [
        { key: 'test-evidence', mode: 'required' },
        { key: 'review-evidence', mode: 'required' },
      ], label);
    }
  }
});

test('specialized document, visual, pull-request, and diagnosis routes stay canonical in observe and enforce modes', () => {
  const cases = [
    {
      prompt: 'Rewrite this README section in Markdown and preserve headings and code fences.',
      intent: 'writing.en',
      workflowRoute: 'writing.markdown',
      requiredSkill: 'writing-markdown-helper',
    },
    {
      prompt: '定位这个 workflow regression 的 root cause，只分析，不要改代码。',
      intent: 'diagnosis',
      workflowRoute: 'code.debug',
      operation: 'diagnose',
      phase: 'diagnose:plugin',
    },
    {
      prompt: 'Review this pull request for maintainability and concrete defects; do not edit files.',
      intent: 'bug-audit',
      workflowRoute: 'code.review',
      operation: 'inspect',
      domain: 'code',
    },
    {
      prompt: '把 LaTeX 编译日志转换成 Markdown 摘要，不判断代码问题，不改源码。',
      intent: 'writing.zh',
      workflowRoute: 'writing.latex',
      operation: 'modify',
      requiredSkill: 'format-latex2markdown',
      forbiddenDomain: 'code',
    },
    {
      prompt: 'Polish this React component visually and improve the responsive layout.',
      intent: 'design.visual',
      workflowRoute: 'design.visual',
      requiredSkill: 'frontend-design',
    },
  ];

  for (const item of cases) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode });
      const label = `${routerMode}: ${item.prompt}`;
      assert.equal(route.intent, item.intent, label);
      assert.equal(route.workflowRoute, item.workflowRoute, label);
      if (item.operation) assert.equal(route.taskDescriptor.operation, item.operation, label);
      if (item.domain) assert.ok(route.taskDescriptor.domains.includes(item.domain), label);
      if (item.forbiddenDomain) assert.equal(route.taskDescriptor.domains.includes(item.forbiddenDomain), false, label);
      if (item.requiredSkill) assert.ok(route.requiredSkills.includes(item.requiredSkill), label);
      if (item.phase) {
        const phases = route.routePlan.phases.map(({ kind, domain }) => `${kind}:${domain}`);
        assert.ok(phases.includes(item.phase), label);
      }
    }
  }
});

test('broad offline repository fact audits keep the full fact workflow', () => {
  const route = routeNaturalLanguageTask({
    prompt: '离线事实核查整个仓库中的全部声明和引用。禁止联网，禁止修改文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。',
    routerMode: 'enforce',
  });

  assert.equal(route.intent, 'fact-check');
  assert.equal(route.taskDescriptor.operation, 'inspect');
  assert.equal(route.taskDescriptor.complexity, 'broad');
  assert.deepEqual(route.routePlan.requiredSkills, [
    'fact-checking',
    'claim-extraction',
    'source-evaluation',
    'citation-authenticity',
  ]);
  assert.deepEqual(route.routePlan.requiredTools, [
    'fact_check_analyze',
    'fact_check_evidence',
    'fact_check_report',
    'fact_check_gate',
  ]);
  assert.deepEqual(route.routePlan.requiredSubagents, []);
  assert.deepEqual(route.routePlan.gateRequirements, [{ key: 'fact-evidence', mode: 'required' }]);
});

test('cited-source support checks stay on the fact route in both router modes', () => {
  for (const prompt of [
    'Check whether the cited source actually supports each claim in this section.',
    'Check whether each claim in this section is supported by the cited source.',
    'Verify whether the citation supports each claim in this section.',
  ]) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode });

      assert.equal(route.intent, 'fact-check', `${routerMode}: ${prompt}`);
      assert.equal(route.taskDescriptor.domains.includes('facts'), true, `${routerMode}: ${prompt}`);
      assert.equal(route.routePlan.gateRequirements.some(({ key }) => key === 'fact-evidence'), true, `${routerMode}: ${prompt}`);
    }
  }
});

test('source-code support wording does not become a cited-source fact check', () => {
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({
      prompt: 'Check whether source code supports the claim made by this interface.',
      routerMode,
    });

    assert.notEqual(route.intent, 'fact-check', routerMode);
    assert.equal(route.taskDescriptor.domains.includes('facts'), false, routerMode);
    assert.equal(route.routePlan.gateRequirements.some(({ key }) => key === 'fact-evidence'), false, routerMode);
  }
});

test('evidence wording in a later sentence does not turn a grammar check into fact-checking', () => {
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({
      prompt: 'Check docs/notes.md for grammar. Repository evidence supports the existing statement; report wording issues only.',
      routerMode,
    });

    assert.notEqual(route.intent, 'fact-check', routerMode);
    assert.equal(route.taskDescriptor.domains.includes('facts'), false, routerMode);
    assert.notEqual(route.taskDescriptor.constraints.networkAccess, 'required', routerMode);
    assert.equal(route.routePlan.gateRequirements.some(({ key }) => key === 'fact-evidence'), false, routerMode);
  }
});
