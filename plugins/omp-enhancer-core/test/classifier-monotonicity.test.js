import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifierDefaults,
  classifierIntents,
  resolveClassificationRoute,
} from '../src/classifier.js';

test('low-confidence classifier output cannot promote an unknown fallback into a workflow', () => {
  const result = resolveLegacy({
    prompt: '谢谢，辛苦了。',
    intent: 'writing.zh',
    confidence: 0.01,
    riskFlags: ['needs-writing-qa'],
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'unknown');
  assert.equal(result.route.intent, 'unknown');
  assert.equal(result.route.classifier.authority, 'fallback');
  assert.equal(result.route.classifier.acceptedIntent, 'unknown');
});

test('classifier cannot relax an explicit read-only workspace ceiling', () => {
  const result = resolveLegacy({
    prompt: '只检查 router.js 并给出优化建议，不要修改代码。',
    intent: 'implementation-with-tests',
    confidence: 0.99,
    riskFlags: ['needs-tests', 'needs-review'],
  });

  assert.equal(result.fallbackRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden');
  assert.equal(result.route.intent, result.fallbackRoute.intent);
  assert.equal(result.route.taskDescriptor.constraints.workspaceWrite, 'forbidden');
  assert.equal(result.route.taskDescriptor.capabilities.includes('fs.write'), false);
  assert.equal(result.route.routePlan.phases.some(({ kind }) => kind === 'modify' || kind === 'create'), false);
});

test('classifier cannot add test execution when the user forbids it', () => {
  const result = resolveLegacy({
    prompt: '修复 classifier，但不要运行测试。',
    intent: 'implementation-with-tests',
    secondaryIntents: ['testing'],
    confidence: 0.99,
    riskFlags: ['needs-tests', 'needs-review'],
  });

  assert.equal(result.route.taskDescriptor.constraints.testExecution, 'forbidden');
  assert.equal(result.route.taskDescriptor.capabilities.includes('tests.execute'), false);
  assert.equal(result.route.routePlan.phases.some(({ kind }) => kind === 'verify'), false);
  assert.equal(gateKeys(result.route).includes('test-evidence'), false);
});

test('classifier cannot add release or external writes when the user forbids them', () => {
  const result = resolveLegacy({
    prompt: '修复插件并补测试，但不要推送或发布。',
    intent: 'release',
    secondaryIntents: ['implementation-with-tests'],
    confidence: 0.99,
    riskFlags: ['release-or-push', 'needs-marketplace-check'],
  });

  assert.equal(result.fallbackRoute.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.equal(result.route.intent, result.fallbackRoute.intent);
  assert.equal(result.route.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.equal(result.route.taskDescriptor.capabilities.includes('external.write'), false);
  assert.equal(result.route.routePlan.phases.some(({ kind }) => kind === 'release'), false);
  assert.equal(gateKeys(result.route).includes('release-approval'), false);
});

test('unknown classifier output cannot downgrade a protected security route or gate', () => {
  const result = resolveLegacy({
    prompt: '只读审查鉴权和密钥处理，不要修改代码。',
    intent: 'unknown',
    confidence: 0.99,
    riskFlags: ['ambiguous'],
  });

  assert.equal(result.fallbackRoute.intent, 'security-review');
  assert.equal(result.route.intent, 'security-review');
  assert.equal(result.route.taskDescriptor.risk.level, 'high');
  assert.equal(result.route.taskDescriptor.risk.flags.includes('security-sensitive'), true);
  assert.equal(gateKeys(result.route).includes('security-evidence'), true);
  assert.equal(result.route.classifier.authority, 'fallback');
});

test('writing hint cannot remove security risk or its required evidence', () => {
  const result = resolveLegacy({
    prompt: '只读审查鉴权和密钥处理，不要修改代码。',
    intent: 'writing.zh',
    confidence: 0.99,
    riskFlags: ['needs-writing-qa'],
  });

  assert.equal(result.fallbackRoute.intent, 'security-review');
  assert.equal(result.route.intent, 'security-review');
  assert.equal(result.route.taskDescriptor.risk.level, 'high');
  assert.equal(result.route.taskDescriptor.risk.flags.includes('security-sensitive'), true);
  assert.equal(gateKeys(result.route).includes('security-evidence'), true);
});

test('classifier writing QA hints cannot create a gate without matching focused-route resources', () => {
  const result = resolveLegacy({
    prompt: 'Polish this sentence: Hello world.',
    intent: 'writing.en',
    confidence: 0.99,
    riskFlags: ['needs-writing-qa'],
    language: 'en',
  });

  assert.equal(result.route.intent, 'writing.en');
  assert.equal(result.route.taskDescriptor.complexity, 'focused');
  assert.equal(requiredGateKeys(result.route).includes('writing-quality'), false);
  assert.equal(result.route.requiredTools.includes('writing_quality_check'), false);
  assert.deepEqual(result.route.requiredSubagents, []);
});

test('unknown classifier output cannot downgrade a release route or hard gate', () => {
  const result = resolveLegacy({
    prompt: '发布当前插件版本。',
    intent: 'unknown',
    confidence: 0.99,
    riskFlags: ['ambiguous'],
  });

  assert.equal(result.fallbackRoute.intent, 'release');
  assert.equal(result.route.intent, 'release');
  assert.equal(result.route.taskDescriptor.constraints.externalWrite, 'required');
  assert.equal(result.route.taskDescriptor.risk.level, 'high');
  assert.equal(gateKeys(result.route).includes('release-approval'), true);
  assert.equal(result.route.classifier.authority, 'fallback');
});

test('secondary intents and risk flags add protected requirements without replacing rule requirements', () => {
  const result = resolveLegacy({
    prompt: '修复这个插件 bug，并补充高信号单元测试。',
    intent: 'implementation-with-tests',
    secondaryIntents: ['security-review'],
    confidence: 0.99,
    riskFlags: ['needs-security-review', 'needs-review'],
  });

  assert.equal(result.route.intent, 'implementation-with-tests');
  assert.equal(result.route.taskDescriptor.domains.includes('security'), true);
  assert.equal(result.route.taskDescriptor.risk.level, 'high');
  assert.equal(result.route.taskDescriptor.risk.flags.includes('security-sensitive'), true);
  assert.deepEqual(gateKeys(result.route), [
    'security-evidence',
    'test-evidence',
    'review-evidence',
  ]);
  assert.equal(result.route.routePlan.requiredSkills.includes('security-review'), true);
  assert.equal(result.route.routePlan.requiredSkills.includes('test-driven-development'), true);
});

test('classifier RoutePlan merging deduplicates subagents by actor identity', () => {
  const result = resolveLegacy({
    prompt: '请事实核查这份文档。',
    intent: 'fact-check',
    confidence: 0.99,
    riskFlags: ['needs-fact-check'],
  });
  const subagents = result.route.routePlan.requiredSubagents;
  const names = subagents.map((entry) => typeof entry === 'string' ? entry : entry.agent);

  assert.equal(names.length, 5);
  assert.equal(new Set(names).size, names.length);
  assert.ok(subagents.every((entry) => typeof entry === 'object' && entry.requiredSkills.length > 0));
});

test('classifier cannot add unrelated domains or gates to a focused local fact route', () => {
  const prompt = '离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。';
  const result = resolveLegacy({
    prompt,
    intent: 'security-review',
    secondaryIntents: ['fact-check'],
    confidence: 0.99,
    riskFlags: ['needs-security-review', 'needs-review'],
  });

  assert.equal(result.route.intent, 'fact-check');
  assert.equal(result.route.taskDescriptor.domains.includes('facts'), true);
  assert.equal(result.route.taskDescriptor.domains.includes('security'), false);
  assert.deepEqual(result.route.requiredSkills, []);
  assert.deepEqual(result.route.requiredTools, []);
  assert.deepEqual(result.route.requiredSubagents, []);
  assert.deepEqual(result.route.routePlan, result.fallbackRoute.routePlan);
  assert.equal(gateKeys(result.route).includes('security-evidence'), false);
});

test('descriptor-hint schema adds risk requirements without granting authority or deleting rule phases', () => {
  const result = resolveClassificationRoute({
    prompt: '修复这个插件 bug，并补充高信号单元测试。',
    output: JSON.stringify({
      operationHint: 'modify',
      domains: ['code', 'tests', 'security', 'plugin'],
      phaseHints: [
        { kind: 'inspect', domain: 'security' },
        { kind: 'review', domain: 'security' },
      ],
      riskFlags: ['needs-security-review', 'needs-review'],
      language: 'zh',
      confidence: 0.96,
      reason: 'Security-sensitive implementation needs an additional review.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.intent, 'implementation-with-tests');
  assert.equal(result.route.classifier.authority, 'advisory');
  assert.equal(result.route.classifier.classification.format, 'descriptor-hints-v1');
  assert.equal(result.route.taskDescriptor.risk.level, 'high');
  assert.equal(result.route.taskDescriptor.domains.includes('security'), true);
  assert.deepEqual(gateKeys(result.route), [
    'security-evidence',
    'test-evidence',
    'review-evidence',
  ]);
  assert.equal(result.route.routePlan.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), true);
});

test('descriptor-hint schema rejects direct constraints, capabilities, or route resources', () => {
  for (const extra of [
    { constraints: { workspaceWrite: 'required' } },
    { capabilities: ['fs.write'] },
    { tools: ['shell'] },
    { agents: ['implementer'] },
    { gates: ['release-approval'] },
  ]) {
    const result = resolveClassificationRoute({
      prompt: '谢谢，辛苦了。',
      output: JSON.stringify({
        operationHint: 'answer',
        domains: ['general'],
        phaseHints: [{ kind: 'answer', domain: 'general' }],
        riskFlags: [],
        language: 'zh',
        confidence: 0.99,
        reason: 'General response.',
        ...extra,
      }),
    });

    assert.equal(result.ok, false, Object.keys(extra)[0]);
    assert.equal(result.route.intent, 'unknown', Object.keys(extra)[0]);
    assert.equal(result.route.taskDescriptor.capabilities.includes('fs.write'), false, Object.keys(extra)[0]);
  }
});

test('invalid classifier output preserves every deterministic protected requirement', () => {
  const result = resolveClassificationRoute({
    prompt: '修复鉴权漏洞、补测试并发布插件。',
    output: '{not valid json',
  });

  assert.equal(result.ok, false);
  assert.equal(result.route.intent, result.fallbackRoute.intent);
  assert.deepEqual(result.route.taskDescriptor.constraints, result.fallbackRoute.taskDescriptor.constraints);
  assert.deepEqual(result.route.taskDescriptor.risk, result.fallbackRoute.taskDescriptor.risk);
  assert.deepEqual(result.route.routePlan.gateRequirements, result.fallbackRoute.routePlan.gateRequirements);
});

test('minimum resolved confidence applies before any fallback-unknown workflow switch', () => {
  for (const confidence of [0, 0.01, classifierDefaults.minResolvedConfidence - 0.01]) {
    const result = resolveLegacy({
      prompt: '谢谢，辛苦了。',
      intent: 'security-review',
      confidence,
      riskFlags: ['needs-security-review'],
    });

    assert.equal(result.route.intent, 'unknown', `confidence=${confidence}`);
    assert.equal(gateKeys(result.route).includes('security-evidence'), false, `confidence=${confidence}`);
  }
});

test('low-confidence risk flags cannot harden or mutate the deterministic descriptor', () => {
  const result = resolveLegacy({
    prompt: '只检查 router.js 并给出优化建议，不要修改代码。',
    intent: 'security-review',
    confidence: 0.01,
    riskFlags: ['needs-security-review'],
  });

  assert.equal(result.route.classifier.authority, 'fallback');
  assert.deepEqual(result.route.taskDescriptor.risk, result.fallbackRoute.taskDescriptor.risk);
  assert.deepEqual(result.route.routePlan.gateRequirements, result.fallbackRoute.routePlan.gateRequirements);
});

test('every legacy intent stays below deterministic protected ceilings', () => {
  const scenarios = [
    {
      prompt: '只检查 router.js 并给出优化建议，不要修改代码。',
      assertSafe(route) {
        assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden');
        assert.equal(route.taskDescriptor.capabilities.includes('fs.write'), false);
      },
    },
    {
      prompt: '修复 classifier，但不要运行测试。',
      assertSafe(route) {
        assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden');
        assert.equal(route.taskDescriptor.capabilities.includes('tests.execute'), false);
      },
    },
    {
      prompt: '修复插件并补测试，但不要推送或发布。',
      assertSafe(route) {
        assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden');
        assert.equal(route.taskDescriptor.capabilities.includes('external.write'), false);
      },
    },
    {
      prompt: '只读审查鉴权和密钥处理，不要修改代码。',
      assertSafe(route) {
        assert.equal(route.taskDescriptor.risk.level, 'high');
        assert.equal(requiredGateKeys(route).includes('security-evidence'), true);
      },
    },
    {
      prompt: '发布当前插件版本。',
      assertSafe(route) {
        assert.equal(route.taskDescriptor.risk.level, 'high');
        assert.equal(requiredGateKeys(route).includes('release-approval'), true);
      },
    },
  ];

  for (const scenario of scenarios) {
    for (const intent of classifierIntents) {
      const result = resolveLegacy({
        prompt: scenario.prompt,
        intent,
        confidence: 0.99,
        riskFlags: ['ambiguous'],
      });
      scenario.assertSafe(result.route, intent);
    }
  }
});

function resolveLegacy({
  prompt,
  intent,
  secondaryIntents = [],
  confidence,
  riskFlags = [],
  language = 'zh',
}) {
  return resolveClassificationRoute({
    prompt,
    output: JSON.stringify({
      intent,
      secondaryIntents,
      language,
      confidence,
      riskFlags,
      domainHints: [],
      reason: 'Classifier hint used by a monotonicity regression test.',
    }),
  });
}

function gateKeys(route) {
  return (route.routePlan?.gateRequirements ?? []).map(({ key }) => key);
}

function requiredGateKeys(route) {
  return (route.routePlan?.gateRequirements ?? [])
    .filter(({ mode }) => mode === 'required')
    .map(({ key }) => key);
}
