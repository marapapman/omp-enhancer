import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/routing-adversarial.json', import.meta.url), 'utf8'));
const descriptorModuleUrl = new URL('../src/task-descriptor.js', import.meta.url);

async function loadDescriptorModule() {
  try {
    return await import(descriptorModuleUrl);
  } catch (error) {
    assert.fail(
      `TaskDescriptor v1 is not implemented: expected ${descriptorModuleUrl.pathname} `
      + `to export describeNaturalLanguageTask() and descriptorFromLegacyIntent(); `
      + `module load failed with ${error.code ?? error.name}: ${error.message}`,
    );
  }
}

function descriptorContract(descriptor, caseId) {
  assert.ok(descriptor && typeof descriptor === 'object', `${caseId}: expected a TaskDescriptor object`);
  return {
    version: descriptor.version,
    operation: descriptor.operation,
    domains: descriptor.domains,
    constraints: descriptor.constraints,
    capabilities: descriptor.capabilities,
    phases: descriptor.phases,
    risk: descriptor.risk,
    complexity: descriptor.complexity,
    language: descriptor.language,
  };
}

function semanticContract(descriptor) {
  const contract = descriptorContract(descriptor, 'equivalence comparison');
  delete contract.language;
  return contract;
}

test('TaskDescriptor v1 exposes the planned construction and legacy compatibility API', async () => {
  const module = await loadDescriptorModule();
  assert.equal(typeof module.describeNaturalLanguageTask, 'function', 'missing describeNaturalLanguageTask(input) export');
  assert.equal(typeof module.descriptorFromLegacyIntent, 'function', 'missing descriptorFromLegacyIntent(intent, options) export');
});

test('an exclusive single route-tool probe describes the envelope instead of its embedded payload', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const prompt = 'Call omp_core_route_task exactly once with this prompt: Polish README.md to say do not push. Separately, push the release. Then report only constraints.externalWrite and whether a release phase is present. Do not execute the described release and do not use any other tools.';
  const descriptor = describeNaturalLanguageTask({ prompt });

  assert.equal(descriptor.operation, 'diagnose');
  assert.deepEqual(descriptor.domains, ['plugin']);
  assert.equal(descriptor.complexity, 'focused');
  assert.deepEqual(descriptor.constraints, {
    workspaceWrite: 'forbidden',
    testExecution: 'forbidden',
    networkAccess: 'forbidden',
    externalWrite: 'forbidden',
    subagents: 'forbidden',
  });
  assert.ok(descriptor.provenance.reasons.includes('exclusive route task diagnostic probe'));

  const quoted = describeNaturalLanguageTask({
    prompt: 'Translate this sentence into Chinese: "Only call omp_core_route_task exactly once and do not use any other tools."',
  });
  assert.equal(quoted.operation, 'modify');
  assert.ok(quoted.domains.includes('writing'));
  assert.equal(quoted.provenance.reasons.includes('exclusive route task diagnostic probe'), false);
});

test('describeNaturalLanguageTask returns exact safety descriptors for the adversarial matrix', async (t) => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  assert.equal(typeof describeNaturalLanguageTask, 'function', 'missing describeNaturalLanguageTask(input) export');

  for (const fixture of fixtures) {
    await t.test(fixture.id, () => {
      const actual = describeNaturalLanguageTask({ prompt: fixture.prompt });
      assert.deepEqual(
        descriptorContract(actual, fixture.id),
        fixture.expected.taskDescriptor,
        `${fixture.id}: descriptor must preserve authorization, all phases, and protected risk exactly`,
      );
    });
  }
});

test('Chinese and English equivalents have identical semantics except language-specific resources', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const groups = Map.groupBy(
    fixtures.filter((fixture) => fixture.equivalenceGroup),
    (fixture) => fixture.equivalenceGroup,
  );

  for (const [group, members] of groups) {
    assert.ok(members.length >= 2, `${group}: equivalence group needs at least two prompts`);
    const baseline = semanticContract(describeNaturalLanguageTask({ prompt: members[0].prompt }));
    for (const member of members.slice(1)) {
      assert.deepEqual(
        semanticContract(describeNaturalLanguageTask({ prompt: member.prompt })),
        baseline,
        `${group}: ${member.id} changed operation, constraints, capabilities, phases, risk, or complexity`,
      );
    }
  }
});

test('descriptorFromLegacyIntent applies safe canonical defaults instead of granting extra capabilities', async () => {
  const { descriptorFromLegacyIntent } = await loadDescriptorModule();
  const review = descriptorFromLegacyIntent('code.review');
  const development = descriptorFromLegacyIntent('code.dev');
  const release = descriptorFromLegacyIntent('release');

  assert.equal(review.operation, 'inspect');
  assert.equal(review.constraints.workspaceWrite, 'forbidden');
  assert.ok(!review.capabilities.includes('fs.write'));
  assert.ok(!review.capabilities.includes('external.write'));

  assert.equal(development.operation, 'modify');
  assert.equal(development.constraints.workspaceWrite, 'required');
  assert.ok(development.capabilities.includes('fs.write'));

  assert.ok(release.phases.some((phase) => phase.kind === 'release'));
  assert.notEqual(release.constraints.externalWrite, 'forbidden');
  assert.ok(release.capabilities.includes('external.write'));
});

test('plugin identifier upgrades remain protected release operations', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Upgrade omp-enhancer-core@omp-enhancer after pushing main.',
    'Upgrade the installed plugin from marketplace.',
    '升级 omp-config@omp-enhancer 到最新版本。',
    '刷新插件 marketplace 并升级用户安装。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'release', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.ok(descriptor.phases.some((phase) => phase.kind === 'release'), prompt);
    assert.ok(descriptor.risk.flags.includes('external-write'), prompt);
  }
});

test('explicit no-subagent constraints remove subagent authority', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const descriptor = describeNaturalLanguageTask({
    prompt: '事实核查这份文档，但不要使用子代理，只由主代理完成。',
  });

  assert.equal(descriptor.constraints.subagents, 'forbidden');
  assert.ok(!descriptor.capabilities.includes('subagents'));
});

test('normalization removes phases and capabilities that exceed explicit constraints', async () => {
  const { normalizeTaskDescriptor } = await loadDescriptorModule();
  const descriptor = normalizeTaskDescriptor({
    operation: 'answer',
    domains: ['general', 'not-a-domain'],
    constraints: {
      workspaceWrite: 'forbidden',
      testExecution: 'forbidden',
      externalWrite: 'forbidden',
      subagents: 'forbidden',
    },
    capabilities: ['fs.write', 'tests.execute', 'external.write', 'subagents'],
    phases: [
      { kind: 'modify', domain: 'code' },
      { kind: 'verify', domain: 'tests' },
      { kind: 'release', domain: 'plugin' },
      { kind: 'unknown-kind', domain: 'general' },
    ],
  });

  assert.deepEqual(descriptor.domains, ['general']);
  assert.deepEqual(descriptor.capabilities, []);
  assert.deepEqual(descriptor.phases, [{ kind: 'answer', domain: 'general' }]);
});

test('normalization accepts only cross-field-valid exclusive tool contracts', async () => {
  const { normalizeTaskDescriptor } = await loadDescriptorModule();
  const command = 'node --test test/parser.test.js';
  const digest = (value) => createHash('sha256').update(value).digest('hex');
  const base = {
    version: 1,
    operation: 'execute',
    domains: ['tests'],
    constraints: { testExecution: 'required' },
    testExecutionTargets: ['test/parser.test.js'],
    testExecutionCommand: command,
    phases: [{ kind: 'verify', domain: 'tests' }],
  };
  const contract = (allowedTools, input) => ({
    schemaVersion: 1,
    mode: 'exclusive',
    allowedTools,
    maxCalls: 1,
    required: true,
    input,
    onFailure: 'stop',
    alternatives: 'forbidden',
  });

  for (const exclusiveToolContract of [
    contract(['bash'], null),
    contract(['grep'], { kind: 'exact-command', digest: digest(command) }),
    contract(['bash'], { kind: 'exact-command', digest: digest('npm test') }),
    contract(['read'], { kind: 'exact-path', target: 'src/auth.js', digest: digest('src/auth.js') }),
  ]) {
    const normalized = normalizeTaskDescriptor({ ...base, exclusiveToolContract });
    assert.equal(normalized.exclusiveToolContract, undefined);
  }

  const valid = normalizeTaskDescriptor({
    ...base,
    exclusiveToolContract: contract(['shell'], { kind: 'exact-command', digest: digest(command) }),
  });
  assert.deepEqual(valid.exclusiveToolContract?.allowedTools, ['bash']);
  assert.equal(valid.exclusiveToolContract?.input?.digest, digest(command));
});

test('normalization preserves supported selective test exclusions without weakening a global prohibition', async () => {
  const { normalizeTaskDescriptor } = await loadDescriptorModule();
  const selective = normalizeTaskDescriptor({
    operation: 'execute',
    domains: ['tests'],
    constraints: { testExecution: 'required' },
    testAllowlist: ['integration', 'unknown-kind', 'unit', 'integration'],
    testExclusions: ['e2e', 'unknown-kind', 'unit', 'e2e'],
    testExecutionTargets: ['./test/router.test.js', 'test/router.test.js', 'not-a-test.js'],
  });
  assert.deepEqual(selective.testAllowlist, ['unit', 'integration']);
  assert.deepEqual(selective.testExclusions, ['unit', 'e2e']);
  assert.deepEqual(selective.testExecutionTargets, ['test/router.test.js']);
  assert.deepEqual(
    normalizeTaskDescriptor(JSON.parse(JSON.stringify(selective))).testAllowlist,
    ['unit', 'integration'],
  );

  const forbidden = normalizeTaskDescriptor({
    operation: 'answer',
    domains: ['tests'],
    constraints: { testExecution: 'forbidden' },
    testAllowlist: ['unit'],
    testExclusions: ['e2e'],
    testExecutionTargets: ['test/router.test.js'],
  });
  assert.deepEqual(forbidden.testAllowlist, []);
  assert.deepEqual(forbidden.testExclusions, []);
  assert.deepEqual(forbidden.testExecutionTargets, []);
});

test('normalization preserves bounded scoped write targets and exclusions', async () => {
  const { normalizeTaskDescriptor } = await loadDescriptorModule();
  const descriptor = normalizeTaskDescriptor({
    operation: 'release',
    domains: ['plugin'],
    constraints: { workspaceWrite: 'required', externalWrite: 'required' },
    workspaceWriteTargets: ['src/router.js', 'src/router.js', '', null, { path: 'bad.js' }],
    workspaceWriteExclusions: ['package-lock.json', 'package-lock.json'],
    externalWriteTargets: ['staging', 'staging'],
    externalWriteExclusions: ['production', 'production'],
  });
  assert.deepEqual(descriptor.workspaceWriteTargets, ['src/router.js']);
  assert.deepEqual(descriptor.workspaceWriteExclusions, ['package-lock.json']);
  assert.deepEqual(descriptor.externalWriteTargets, ['staging']);
  assert.deepEqual(descriptor.externalWriteExclusions, ['production']);
  assert.deepEqual(
    normalizeTaskDescriptor(JSON.parse(JSON.stringify(descriptor))).externalWriteExclusions,
    ['production'],
  );
});

test('normalization never grants external-write authority to answer or inspect descriptors', async () => {
  const { normalizeTaskDescriptor } = await loadDescriptorModule();
  for (const operation of ['answer', 'inspect']) {
    const descriptor = normalizeTaskDescriptor({
      operation,
      domains: ['code'],
      constraints: { externalWrite: 'required', networkAccess: 'required' },
      capabilities: ['external.write', 'credentials', 'network.read'],
      phases: [{ kind: 'release', domain: 'plugin' }],
    });
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', operation);
    assert.ok(!descriptor.capabilities.includes('external.write'), operation);
    assert.ok(!descriptor.capabilities.includes('credentials'), operation);
    assert.ok(!descriptor.phases.some(({ kind }) => kind === 'release'), operation);
  }
});

test('explicit no-network language creates a protected network constraint', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    '只审查本地代码，不要联网，也不要修改文件。',
    'Review the local code only; do not access the network and do not modify files.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.networkAccess, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('network.read'), prompt);
  }
});

test('natural bilingual no-test phrases forbid test execution', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Fix src/router.js, but skip the tests.',
    'Fix src/router.js; do not test it.',
    'Fix src/router.js without testing it.',
    '修复 src/router.js，但不要测试。',
    '修复 src/router.js，跳过测试。',
    '修复 src/router.js，不用测试。',
    'Fix src/router.js, but do not run all tests.',
    '修复 src/router.js，但不要运行全部测试。',
    '修复 src/router.js，但不要运行所有测试。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.testExecution, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('tests.execute'), prompt);
    assert.ok(!descriptor.phases.some(({ kind, domain }) => kind === 'verify' && domain === 'tests'), prompt);
    assert.deepEqual(descriptor.testExclusions, [], prompt);
  }
});

test('selective test exclusions authorize requested test kinds without global no-test deadlock', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Run unit tests only, do not run end-to-end tests.',
    'Run unit tests only, do not run e2e tests.',
    '只运行单元测试，不要运行端到端测试。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.equal(descriptor.constraints.testExecution, 'required', prompt);
    assert.deepEqual(descriptor.testAllowlist, ['unit'], prompt);
    assert.deepEqual(descriptor.testExclusions, ['e2e'], prompt);
    assert.ok(descriptor.capabilities.includes('tests.execute'), prompt);
    assert.ok(descriptor.phases.some((phase) => phase.kind === 'verify' && phase.domain === 'tests'), prompt);
    assert.ok(!descriptor.provenance.reasons.includes('test execution forbidden'), prompt);
  }

  for (const { prompt, kind } of [
    { prompt: 'Run only integration tests.', kind: 'integration' },
    { prompt: 'Only run smoke tests.', kind: 'smoke' },
    { prompt: '只运行单元测试。', kind: 'unit' },
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.equal(descriptor.constraints.testExecution, 'required', prompt);
    assert.deepEqual(descriptor.testAllowlist, [kind], prompt);
  }

  for (const prompt of ['Do not run unit tests.', '不要运行集成测试。']) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'answer', prompt);
    assert.equal(descriptor.constraints.testExecution, 'unspecified', prompt);
    assert.deepEqual(descriptor.testExclusions, [prompt.startsWith('Do') ? 'unit' : 'integration'], prompt);
    assert.ok(!descriptor.capabilities.includes('tests.execute'), prompt);
  }

  for (const prompt of [
    'Fix src/router.js, but do not run the full test suite.',
    'Fix src/router.js, but do not run the whole test suite.',
    'Fix src/router.js, but do not run the entire test suite.',
    'Fix src/router.js, but do not run the complete test suite.',
    'Fix src/router.js, but avoid the full test suite.',
    '只改 src/router.js，但不要跑全量测试。',
    '只改 src/router.js，但不要运行完整测试套件。',
    '只改 src/router.js，但不要跑整个测试套件。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.equal(descriptor.constraints.testExecution, 'unspecified', prompt);
    assert.deepEqual(descriptor.testExclusions, ['full-suite'], prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(!descriptor.provenance.reasons.includes('test execution forbidden'), prompt);
  }
});

test('writing artifacts and narrow Chinese edit imperatives retain their positive task authority', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();

  const bugReport = describeNaturalLanguageTask({
    prompt: '写一份英文 bug report，包含复现步骤和影响范围，不运行测试。',
  });
  assert.equal(bugReport.operation, 'modify');
  assert.deepEqual(bugReport.domains, ['writing']);
  assert.equal(bugReport.language, 'en');
  assert.equal(bugReport.complexity, 'broad');
  assert.equal(bugReport.constraints.testExecution, 'forbidden');

  const narrowEdit = describeNaturalLanguageTask({
    prompt: '只改一行代码，但不要跑全量测试。',
  });
  assert.equal(narrowEdit.operation, 'modify');
  assert.deepEqual(narrowEdit.domains, ['code']);
  assert.equal(narrowEdit.constraints.workspaceWrite, 'required');
  assert.equal(narrowEdit.constraints.testExecution, 'unspecified');
  assert.deepEqual(narrowEdit.testExclusions, ['full-suite']);

  for (const prompt of [
    'Write a bug report for the parser bug; do not run tests.',
    '写一份英文 bug report，描述 parser 的 bug，不运行测试。',
    'Summarize the existing bug report without inspecting code or running tests.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.deepEqual(descriptor.domains, ['writing'], prompt);
  }

  for (const prompt of [
    'Fix the bug described in the bug report.',
    'Write a bug report generator in src/report.js.',
    'Revise the bug report parser implementation.',
    'Write tests from this bug report.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.ok(descriptor.domains.includes('code') || descriptor.domains.includes('tests'), prompt);
    assert.notEqual(descriptor.domains.length === 1 && descriptor.domains[0] === 'writing', true, prompt);
  }

  const compound = describeNaturalLanguageTask({ prompt: 'Write a bug report and fix the parser bug.' });
  assert.equal(compound.operation, 'modify');
  assert.ok(compound.domains.includes('code'));
  assert.ok(compound.domains.includes('writing'));

  const guide = describeNaturalLanguageTask({ prompt: 'Write a complete troubleshooting guide.' });
  assert.equal(guide.operation, 'modify');
  assert.deepEqual(guide.domains, ['writing']);
  assert.equal(guide.complexity, 'broad');
});

test('observed summaries distinguish a no-rerun ceiling from a new test action', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    '总结本轮 E2E 测试结果，不重新运行测试。',
    '总结本轮 E2E 测试结果，不再运行测试。',
    '整理已观测到的测试问题，不做任何新测试。',
    '总结本轮 E2E 测试结果。',
  ]) {
    const summary = describeNaturalLanguageTask({ prompt });
    assert.equal(summary.operation, 'modify', prompt);
    assert.ok(summary.domains.includes('writing'), prompt);
    assert.equal(summary.constraints.testExecution, 'forbidden', prompt);
  }

  for (const prompt of [
    '总结本轮 E2E 测试结果，然后重新运行失败测试。',
    '重跑失败测试，然后总结已观测结果。',
    'Rerun the failed tests and then summarize the observed results.',
  ]) {
    const rerun = describeNaturalLanguageTask({ prompt });
    assert.equal(rerun.operation, 'execute', prompt);
    assert.equal(rerun.constraints.testExecution, 'required', prompt);
  }
});

test('natural bilingual no-network phrases forbid network access', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Fact-check this document, but do not browse the web.',
    'Fact-check this document; do not go online.',
    '事实核查这份文档，但不要上网。',
    '查证这份文档的事实，不要浏览网页。',
    '查证这份文档的事实，跳过网络搜索。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.networkAccess, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('network.read'), prompt);
  }
});

test('bare negative clauses override earlier write, test, network, and release requests', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Fix parser.js. No edits.',
    'Fix parser.js. No changes.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.capabilities.includes('fs.write'), false, prompt);
  }

  for (const prompt of [
    'Fix src/auth.js. No tests, no network, no subagents.',
    'Fix src/auth.js; no testing, no internet, and no subagents.',
    '修复 src/auth.js，不测试，不联网，不用子代理。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.testExecution, 'forbidden', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'forbidden', prompt);
    assert.equal(descriptor.constraints.subagents, 'forbidden', prompt);
  }

  for (const prompt of [
    'Fix parser.js and push it. No push.',
    'Fix parser.js and publish it. No publishing.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.equal(descriptor.capabilities.includes('external.write'), false, prompt);
    assert.equal(descriptor.phases.some(({ kind }) => kind === 'release'), false, prompt);
  }
});

test('affirmative and double-negative test or web instructions are not treated as prohibitions', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Fix src/router.js and run the tests.',
    'Do not skip the tests; run the tests after fixing src/router.js.',
    'Do not run the dev server; fix src/router.js and run the tests.',
    '不要跳过测试；修复 src/router.js 后运行测试。',
    '禁止跳过测试；修复 src/router.js 后运行测试。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.testExecution, 'required', prompt);
    assert.ok(descriptor.capabilities.includes('tests.execute'), prompt);
  }

  for (const prompt of [
    'Fact-check this document by browsing the web.',
    'Do not avoid web browsing; fact-check this document online.',
    'Do not use the mock network; browse the web to fact-check this document.',
    '不要跳过网页搜索，请上网查证这份文档的事实。',
    '禁止跳过网页搜索，请上网查证这份文档的事实。',
    '不要修改网络模块，请上网查证这份文档的事实。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.ok(descriptor.capabilities.includes('network.read'), prompt);
  }
});

test('affirmative release clauses are not mistaken for no-external-write constraints', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'No need to wait, publish now.',
    'There are no blockers; deploy now.',
    'Do not delay the release; publish now.',
    '不要再等了，发布这个包。',
    '不需要等待，直接部署。',
    '不要跳过发布步骤，发布它。',
    '禁止跳过发布步骤，发布它。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'release', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.ok(descriptor.capabilities.includes('external.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind }) => kind === 'release'), prompt);
  }

  for (const prompt of [
    'Do not publish yet; inspect the release plan only.',
    '不要发布，只检查发布计划。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
  }
});

test('affirmative modification clauses are not mistaken for read-only constraints', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    "Don't hesitate to modify src/router.js.",
    'Do not avoid changing src/router.js.',
    '不要只分析，实现修复 src/router.js。',
    '禁止只分析，实现修复 src/router.js。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), prompt);
  }
});

test('affirmative subagent clauses are not mistaken for no-subagent constraints', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Do not hesitate to use subagents.',
    'No need to avoid subagents; use them.',
    '不要犹豫，使用子代理。',
    '不用等待，直接使用子代理。',
    '不要跳过子代理协作。',
    '禁止跳过子代理协作。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.notEqual(descriptor.constraints.subagents, 'forbidden', prompt);
  }

  for (const prompt of [
    'Do not use subagents.',
    '不要使用子代理。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.subagents, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('subagents'), prompt);
  }
});

test('local git metadata commands authorize workspace mutation without external write', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Commit the current changes.',
    'Create a git commit for the router fix.',
    'Stage and commit src/router.js; do not push.',
    'Amend the last commit.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.ok(descriptor.domains.includes('code'), prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(descriptor.capabilities.includes('shell.execute'), prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), prompt);
    assert.equal(descriptor.provenance.requiresPolicyRoute, true, prompt);
  }

  const explanation = describeNaturalLanguageTask({ prompt: 'Explain what git commit does.' });
  assert.equal(explanation.operation, 'answer');
  assert.equal(explanation.constraints.workspaceWrite, 'forbidden');
  assert.ok(!explanation.capabilities.includes('fs.write'));
});

test('bilingual whole-codebase bug audits explicitly authorize verification unless tests are forbidden', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    '检查项目代码所有 bug。',
    'Audit the whole codebase for bugs.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'inspect', prompt);
    assert.deepEqual(descriptor.domains, ['code'], prompt);
    assert.equal(descriptor.complexity, 'broad', prompt);
    assert.equal(descriptor.constraints.testExecution, 'required', prompt);
    assert.ok(descriptor.capabilities.includes('tests.execute'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'verify' && domain === 'tests'), prompt);
  }

  for (const prompt of [
    '检查项目代码所有 bug，但不要运行测试。',
    'Audit the whole codebase for bugs, but do not run tests.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'inspect', prompt);
    assert.deepEqual(descriptor.domains, ['code'], prompt);
    assert.equal(descriptor.complexity, 'broad', prompt);
    assert.equal(descriptor.constraints.testExecution, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('tests.execute'), prompt);
    assert.ok(!descriptor.phases.some(({ kind, domain }) => kind === 'verify' && domain === 'tests'), prompt);
  }
});

test('common implicit code-change imperatives deterministically authorize a focused modification', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Take care of the TODO in src/router.js.',
    'Handle the issue in src/router.js.',
    'Make router.js work with empty input.',
    '把 router.js 处理一下。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.deepEqual(descriptor.domains, ['code'], prompt);
    assert.equal(descriptor.complexity, 'focused', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), prompt);
    assert.equal(descriptor.provenance.needsClassifier, false, prompt);
    assert.equal(descriptor.provenance.requiresPolicyRoute, true, prompt);
  }
});

test('Chinese repair prefixes preserve executable modification authority', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    '去修复这些问题，但是先给我一个计划。对于门禁有关的问题，应该事前做好工作。',
    '继续修复 router.js 的路由问题。',
    '开始实现 classifier fallback。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), prompt);
  }
});

test('security concepts with an explicit no-audit clause remain answer-only', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    '解释一下 XSS 是什么，先不要审查项目代码。',
    'Explain SSRF. No code review.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'answer', prompt);
    assert.equal(descriptor.capabilities.length, 0, prompt);
    assert.equal(descriptor.phases.some(({ kind }) => kind === 'review'), false, prompt);
  }
});

test('one explicitly bounded test file review stays focused', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const descriptor = describeNaturalLanguageTask({
    prompt: 'Review one test file for defects without running tests and without subagents.',
  });
  assert.equal(descriptor.operation, 'inspect');
  assert.equal(descriptor.complexity, 'focused');
  assert.equal(descriptor.constraints.testExecution, 'forbidden');
  assert.equal(descriptor.constraints.subagents, 'forbidden');
});

test('explicit cross-file English refactors remain broad while a single function stays focused', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const broad = describeNaturalLanguageTask({
    prompt: 'Refactor the whole routing module across multiple files and add regression tests.',
  });
  assert.equal(broad.complexity, 'broad');

  const focused = describeNaturalLanguageTask({
    prompt: 'Refactor the routeNaturalLanguageTask function and add one regression test.',
  });
  assert.equal(focused.complexity, 'focused');
});

test('weak code-target imperatives request classification without pre-authorizing writes', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Look into src/router.js.',
    '看一下 src/router.js。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('fs.write'), prompt);
    assert.equal(descriptor.provenance.needsClassifier, true, prompt);
    assert.equal(descriptor.provenance.requiresPolicyRoute, true, prompt);
  }
});

test('code explanations and explicit reviews remain read-only', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const explanation = describeNaturalLanguageTask({
    prompt: 'Explain how router.js handles empty input.',
  });
  assert.equal(explanation.operation, 'answer');
  assert.equal(explanation.constraints.workspaceWrite, 'forbidden');
  assert.ok(!explanation.capabilities.includes('fs.write'));
  assert.equal(explanation.provenance.needsClassifier, false);

  const review = describeNaturalLanguageTask({
    prompt: 'Review the TODO in src/router.js and report findings only.',
  });
  assert.equal(review.operation, 'inspect');
  assert.equal(review.constraints.workspaceWrite, 'forbidden');
  assert.ok(!review.capabilities.includes('fs.write'));
  assert.equal(review.provenance.needsClassifier, false);
});

test('answer-only side-effect advice does not authorize or gate the described action', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'How do I delete all cache files safely? Do not execute anything.',
    '请告诉我如何删除缓存里的所有文件，不要执行。',
    'Explain how to push a git branch without doing it.',
    'Tell me how to upload a file to Google Drive folder F1.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'answer', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.notEqual(descriptor.constraints.networkAccess, 'required', prompt);
    assert.ok(!descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
    assert.ok(!descriptor.capabilities.includes('network.read'), prompt);
    assert.ok(!descriptor.risk.flags.includes('irreversible-file-operation'), prompt);
    assert.ok(!descriptor.risk.flags.includes('user-approval-required'), prompt);
  }
});

test('bilingual local development commands compile as focused shell execution', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Run npm start for the local dev server.',
    'npm run dev',
    'Start the local dev server with npm run dev.',
    '运行 npm start 启动本地开发服务器。',
    '运行 npm run dev。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.deepEqual(descriptor.domains, ['code'], prompt);
    assert.equal(descriptor.complexity, 'focused', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'unspecified', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'unspecified', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(descriptor.capabilities.includes('shell.execute'), prompt);
    assert.ok(!descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(!descriptor.capabilities.includes('network.read'), prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'execute' && domain === 'code'), prompt);
    assert.equal(descriptor.provenance.requiresPolicyRoute, true, prompt);
  }
});

test('bilingual local database migrations compile as focused write-capable execution', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Run the local database migration script.',
    '运行本地数据库迁移脚本。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.deepEqual(descriptor.domains, ['config'], prompt);
    assert.equal(descriptor.complexity, 'focused', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'unspecified', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(descriptor.capabilities.includes('shell.execute'), prompt);
    assert.ok(!descriptor.capabilities.includes('network.read'), prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'execute' && domain === 'config'), prompt);
  }
});

test('explicit negative constraints dominate local operational execution defaults', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Run npm start for the local dev server, but do not modify files, do not access the network, and do not publish anything.',
    '运行本地数据库迁移脚本，但不要修改任何文件，不要联网，也不要发布。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'forbidden', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(!descriptor.capabilities.includes('network.read'), prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
  }
});

test('operational explanations and reviews are not mistaken for execution', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Explain what npm run dev does.',
    '解释 npm run dev 的作用。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'answer', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
  }
  for (const prompt of [
    'Review the local database migration script and report findings only.',
    '审查本地数据库迁移脚本，只报告问题。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'inspect', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
  }
});

test('local build and format commands compile as write-capable execution without external authority', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Run npm run build.',
    'Run npm run format.',
    '运行 npm run build。',
    '运行 npm run format。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.deepEqual(descriptor.domains, ['code'], prompt);
    assert.equal(descriptor.complexity, 'focused', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'unspecified', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(descriptor.capabilities.includes('shell.execute'), prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'execute' && domain === 'code'), prompt);
  }
});

test('dependency installation and setup scripts compile with bounded local automation authority', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Install project dependencies.',
    'Run npm install.',
    '安装项目依赖。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.deepEqual(descriptor.domains, ['config'], prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(descriptor.capabilities.includes('shell.execute'), prompt);
    assert.ok(descriptor.capabilities.includes('network.read'), prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
    assert.ok(descriptor.phases.some(({ kind, domain }) => kind === 'execute' && domain === 'config'), prompt);
  }

  for (const prompt of ['Run the setup script.', '运行项目 setup 脚本。']) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.deepEqual(descriptor.domains, ['config'], prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'unspecified', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(descriptor.capabilities.includes('shell.execute'), prompt);
  }
});

test('automation wording does not turn explanations into execution or build substrings into UI work', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const explanation = describeNaturalLanguageTask({ prompt: 'Explain what npm run build does.' });
  assert.equal(explanation.operation, 'answer');
  assert.equal(explanation.constraints.workspaceWrite, 'forbidden');

  const build = describeNaturalLanguageTask({ prompt: 'Run npm run build.' });
  assert.deepEqual(build.domains, ['code']);
  assert.ok(!build.domains.includes('visual'));

  const visual = describeNaturalLanguageTask({ prompt: 'Build the UI.' });
  assert.equal(visual.operation, 'create');
  assert.ok(visual.domains.includes('visual'));
});

test('explicit destructive workspace imperatives reach the irreversible approval contract', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Delete all files in cache.',
    'Wipe the cache directory.',
    'Clear all cache files.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    assert.equal(descriptor.risk.level, 'critical', prompt);
    assert.ok(descriptor.risk.flags.includes('irreversible-file-operation'), prompt);
    assert.ok(descriptor.risk.flags.includes('user-approval-required'), prompt);
  }

  for (const prompt of [
    'Explain how to delete all cache files safely.',
    'How do I wipe the cache directory? Do not execute anything.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'answer', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.ok(!descriptor.risk.flags.includes('irreversible-file-operation'), prompt);
  }
});

test('explicit destructive external requests are recognized but require a supported protected contract', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Delete GitHub issue 123.',
    'Delete Notion page abc.',
    'Remove production database record 42.',
    'Drop the production database table users.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.equal(descriptor.risk.level, 'critical', prompt);
    assert.ok(descriptor.risk.flags.includes('irreversible-file-operation'), prompt);
    assert.ok(descriptor.risk.flags.includes('user-approval-required'), prompt);
    assert.ok(descriptor.provenance.reasons.includes('irreversible external operation requested'), prompt);
  }

  for (const prompt of [
    'Explain how to delete GitHub issue 123 without doing it.',
    'Do not delete Notion page abc.',
    'Explain how to drop the production database table users.',
    'Do not drop the production database table users.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(!descriptor.provenance.reasons.includes('irreversible external operation requested'), prompt);
  }
});

test('scoped workspace and external denials do not erase explicitly authorized targets', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const { prompt, target, exclusion } of [
    { prompt: 'Fix src/router.js, but do not modify package-lock.json.', target: 'src/router.js', exclusion: 'package-lock.json' },
    { prompt: 'Update README.md but not package.json.', target: 'README.md', exclusion: 'package.json' },
    { prompt: '修复 src/router.js，但不要修改 package-lock.json。', target: 'src/router.js', exclusion: 'package-lock.json' },
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.deepEqual(descriptor.workspaceWriteTargets, [target], prompt);
    assert.deepEqual(descriptor.workspaceWriteExclusions, [exclusion], prompt);
  }

  for (const prompt of [
    'Deploy to staging, but do not deploy to production.',
    '部署到预发布环境，但不要部署到生产环境。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'release', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.deepEqual(descriptor.externalWriteTargets, ['staging'], prompt);
    assert.deepEqual(descriptor.externalWriteExclusions, ['production'], prompt);
  }
});

test('review nouns cannot be mistaken for workspace modification verbs', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  for (const prompt of [
    'Verify the bibliography metadata for this draft.',
    'Review this draft for factual errors.',
    'Inspect the update plan for risks.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.capabilities.includes('fs.write'), false, prompt);
    assert.equal(descriptor.phases.some(({ kind }) => ['modify', 'create'].includes(kind)), false, prompt);
  }
});

test('a trailing concise status report does not turn a focused code edit into writing work', async () => {
  const { describeNaturalLanguageTask } = await loadDescriptorModule();
  const prompt = 'Fix only src/parser.js so parseCsv trims whitespace around every comma-separated item. Do not modify any other file. Do not run tests. Do not use subagents. Do not access the network. Read src/parser.js, make one focused edit, read back src/parser.js, and report concisely.';
  const descriptor = describeNaturalLanguageTask({ prompt });

  assert.equal(descriptor.operation, 'modify');
  assert.deepEqual(descriptor.domains, ['code']);
  assert.equal(descriptor.complexity, 'focused');
  assert.deepEqual(descriptor.constraints, {
    workspaceWrite: 'required',
    testExecution: 'forbidden',
    networkAccess: 'forbidden',
    externalWrite: 'forbidden',
    subagents: 'forbidden',
  });
  assert.deepEqual(descriptor.workspaceWriteTargets, ['src/parser.js']);
  assert.deepEqual(descriptor.workspaceWriteExclusions, []);
  assert.deepEqual(descriptor.phases, [
    { kind: 'inspect', domain: 'code' },
    { kind: 'modify', domain: 'code' },
    { kind: 'review', domain: 'code' },
  ]);

  const writing = describeNaturalLanguageTask({
    prompt: 'Edit the project report for clarity and concision.',
  });
  assert.deepEqual(writing.domains, ['writing']);
  assert.equal(writing.complexity, 'broad');

  const punctuatedWriting = describeNaturalLanguageTask({
    prompt: 'Write a concise, accurate report about this incident.',
  });
  assert.ok(punctuatedWriting.domains.includes('writing'));

  const unscoped = describeNaturalLanguageTask({ prompt: 'Fix a bug in the project.' });
  assert.deepEqual(unscoped.workspaceWriteTargets, []);
});
