import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClassifierPrompt,
  classifierDefaults,
  classifierSchema,
  parseClassifierOutput,
  resolveClassificationRoute,
} from '../src/classifier.js';

test('buildClassifierPrompt uses OMP Tiny and the strict schema', () => {
  const result = buildClassifierPrompt({
    prompt: '帮我看看这个插件 workflow 为什么不对。',
  });

  assert.equal(result.modelRole, 'tiny');
  assert.equal(result.model, classifierDefaults.model);
  assert.equal(result.temperature, 0);
  assert.equal(result.maxOutputTokens, 500);
  assert.equal(result.minResolvedConfidence, classifierDefaults.minResolvedConfidence);
  assert.equal(result.minRouteOverrideConfidence, classifierDefaults.minRouteOverrideConfidence);
  assert.equal(result.minUnknownOverrideConfidence, classifierDefaults.minUnknownOverrideConfidence);
  assert.equal(result.schema, classifierSchema);
  assert.deepEqual(result.schema.required, [
    'operationHint',
    'domains',
    'phaseHints',
    'riskFlags',
    'language',
    'confidence',
    'reason',
  ]);
  assert.equal('intent' in result.schema.properties, false);
  assert.equal('constraints' in result.schema.properties, false);
  assert.equal('capabilities' in result.schema.properties, false);
  assert.equal('skills' in result.schema.properties, false);
  assert.equal('tools' in result.schema.properties, false);
  assert.equal('agents' in result.schema.properties, false);
  assert.equal('gates' in result.schema.properties, false);
  assert.equal(result.fallbackRoute.intent, 'diagnosis');
  assert.match(result.prompt, /modelRoles\.tiny/);
  assert.match(result.prompt, /opencode-go\/deepseek-v4-flash:medium/);
  assert.match(result.prompt, /Return only JSON/);
  assert.match(result.prompt, /descriptor hints only/);
  assert.match(result.prompt, /deterministic rule route is the capability ceiling/i);
  assert.match(result.prompt, /all low-confidence hints fall back/);
  assert.match(result.prompt, /cannot exceed the deterministic capability ceiling/);
  assert.match(result.prompt, /cannot remove deterministic release, security, or irreversible-operation requirements/);
});

test('buildClassifierPrompt teaches Tiny route boundaries for gate workflow repair cases', () => {
  const result = buildClassifierPrompt({
    prompt: '去修复这些问题，但是先给我一个计划。对于门禁有关的问题，应该事前做好工作。',
  });

  assert.match(result.prompt, /implementation repair plan/i);
  assert.match(result.prompt, /workflow validation/i);
  assert.match(result.prompt, /test-observation summary/i);
  assert.match(result.prompt, /real config-assets inventory/i);
  assert.match(result.prompt, /Do not expose classifier or smart-gate prompts/i);
});

test('buildClassifierPrompt includes observed uncertain context when provided', () => {
  const result = buildClassifierPrompt({
    prompt: '先不用动代码，只解释可能的方向。',
    context: [
      '帮我看看这个东西。',
      '先不用动代码，只解释可能的方向。',
    ],
  });

  assert.match(result.prompt, /Observed uncertain context:/);
  assert.match(result.prompt, /1\. 帮我看看这个东西。/);
  assert.match(result.prompt, /2\. 先不用动代码，只解释可能的方向。/);
});

test('parseClassifierOutput accepts fenced JSON output', () => {
  const parsed = parseClassifierOutput([
    '```json',
    '{"intent":"writing.en","secondaryIntents":[],"language":"en","confidence":0.9,"riskFlags":["needs-writing-qa"],"domainHints":["paper"],"reason":"English writing request"}',
    '```',
  ].join('\n'));

  assert.equal(parsed.intent, 'writing.en');
  assert.equal(parsed.confidence, 0.9);
});

test('resolveClassificationRoute maps valid classifier JSON through the route whitelist', () => {
  const result = resolveClassificationRoute({
    prompt: 'Draft an English related work paragraph and check the logic.',
    output: JSON.stringify({
      intent: 'writing.en',
      secondaryIntents: [],
      language: 'en',
      confidence: 0.91,
      riskFlags: ['needs-writing-qa', 'needs-review'],
      domainHints: ['paper'],
      reason: 'The user asks for English prose drafting and review.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.intent, 'writing.en');
  assert.equal(result.route.source, 'llm-classifier');
  assert.equal(result.route.classifier.status, 'resolved');
  assert.deepEqual(result.route.requiredSkills, ['writing-markdown-helper', 'writing-checkers']);
  assert.deepEqual(result.route.requiredSubagents.map(({ agent }) => agent), ['writer', 'checker']);
});

test('resolveClassificationRoute maps bug audit classifier output to audit subagents', () => {
  const result = resolveClassificationRoute({
    prompt: '帮我测试项目并检查 bug，写 bug audit report，不要修复代码。',
    output: JSON.stringify({
      intent: 'bug-audit',
      secondaryIntents: ['testing'],
      language: 'zh',
      confidence: 0.91,
      riskFlags: ['needs-tests', 'needs-review', 'needs-subagents'],
      domainHints: ['bug audit'],
      reason: 'The user asks to test and report bugs without fixing code.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.intent, 'bug-audit');
  assert.equal(result.route.source, 'llm-classifier');
  assert.deepEqual(result.route.requiredSubagents.map(({ agent }) => agent), [
    'ecc-tdd-guide',
    'ecc-code-reviewer',
    'ecc-silent-failure-hunter',
    'ecc-pr-test-analyzer',
  ]);
});

test('resolveClassificationRoute maps fact-check classifier output to cross-validated workflow', () => {
  const result = resolveClassificationRoute({
    prompt: '帮我事实核查这段文字里的数据、年份和引用真实性。',
    output: JSON.stringify({
      intent: 'fact-check',
      secondaryIntents: [],
      language: 'zh',
      confidence: 0.93,
      riskFlags: ['needs-fact-check', 'needs-subagents', 'needs-review'],
      domainHints: ['citation authenticity', 'factual claims'],
      reason: 'The user explicitly asks to verify factual claims, data, dates, and citations.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.intent, 'fact-check');
  assert.equal(result.route.source, 'llm-classifier');
  assert.deepEqual(result.route.requiredSkills, ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity']);
  assert.deepEqual(result.route.requiredTools, ['fact_check_analyze', 'fact_check_evidence', 'fact_check_report', 'fact_check_gate']);
  assert.deepEqual(result.route.requiredSubagents.map(({ agent }) => agent), [
    'fact-planner',
    'fact-researcher-a',
    'fact-researcher-b',
    'fact-cross-checker',
    'fact-reviewer',
  ]);
});

test('resolveClassificationRoute preserves focused audit mode from the deterministic route', () => {
  const result = resolveClassificationRoute({
    prompt: 'Do the bug investigation directly as a focused audit; report verified findings only.',
    output: JSON.stringify({
      intent: 'bug-audit',
      secondaryIntents: [],
      language: 'en',
      confidence: 0.91,
      riskFlags: ['needs-tests', 'needs-review'],
      domainHints: ['focused audit'],
      reason: 'The user asks for direct bug investigation without fixing code.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'bug-audit');
  assert.equal(result.fallbackRoute.auditMode, 'focused');
  assert.equal(result.route.intent, 'bug-audit');
  assert.equal(result.route.auditMode, 'focused');
  assert.deepEqual(result.route.requiredSubagents, []);
  assert.deepEqual(result.route.requiredSkills, []);
  assert.deepEqual(result.route.requiredTools, []);
});

test('resolveClassificationRoute aliases legacy testing classifier output to bug audit', () => {
  const result = resolveClassificationRoute({
    prompt: '为 classifier 写高信号单元测试，覆盖 fallback 和边界。',
    output: JSON.stringify({
      intent: 'testing',
      secondaryIntents: [],
      language: 'zh',
      confidence: 0.91,
      riskFlags: ['needs-tests', 'needs-subagents'],
      domainHints: ['legacy testing'],
      reason: 'Legacy testing classifier output.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.intent, 'bug-audit');
  assert.equal(result.route.source, 'llm-classifier');
  assert.equal(result.route.classifier.classification.intent, 'testing');
});

test('resolveClassificationRoute keeps high-confidence unknown on concept-only prompts', () => {
  const result = resolveClassificationRoute({
    prompt: 'Explain what coverage means in plain English.',
    output: JSON.stringify({
      intent: 'unknown',
      secondaryIntents: [],
      language: 'en',
      confidence: 0.92,
      riskFlags: ['ambiguous'],
      domainHints: ['terminology'],
      reason: 'The user asks for a general explanation, not a testing workflow.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'unknown');
  assert.equal(result.route.intent, 'unknown');
  assert.equal(result.route.classifier.classification.intent, 'unknown');
});

test('resolveClassificationRoute falls back from low-confidence wrong intents to avoid missing required workflow', () => {
  const result = resolveClassificationRoute({
    prompt: '修复这个插件 bug，并补充高信号单元测试。',
    output: JSON.stringify({
      intent: 'release',
      secondaryIntents: [],
      language: 'zh',
      confidence: 0.21,
      riskFlags: ['release-or-push'],
      domainHints: ['plugin'],
      reason: 'Uncertain guess based on plugin wording.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'implementation-with-tests');
  assert.equal(result.route.intent, 'implementation-with-tests');
  assert.equal(result.route.classifier.classification.intent, 'release');
});

test('resolveClassificationRoute keeps product feature prompts on implementation route', () => {
  const result = resolveClassificationRoute({
    prompt: '请写一个用户看板，包含统计数字和最近活动。',
    output: JSON.stringify({
      intent: 'implementation-with-tests',
      secondaryIntents: [],
      language: 'zh',
      confidence: 0.94,
      riskFlags: ['needs-tests', 'needs-review', 'needs-subagents'],
      domainHints: ['dashboard', 'frontend feature'],
      reason: 'The user asks to build a product UI feature, not draft prose.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'implementation-with-tests');
  assert.equal(result.route.intent, 'implementation-with-tests');
  assert.equal(result.route.agent, 'implementer');
  assert.equal(result.route.source, 'llm-classifier');
  assert.equal(result.route.classifier.authority, 'advisory');
  assert.deepEqual(result.route.requiredSubagents.map(({ agent }) => agent), ['plan', 'implementation-task', 'reviewer']);
});

test('resolveClassificationRoute no longer depends on classifier override for product feature prompts', () => {
  const result = resolveClassificationRoute({
    prompt: '请写一个用户看板，包含统计数字和最近活动。',
    output: JSON.stringify({
      intent: 'implementation-with-tests',
      secondaryIntents: [],
      language: 'zh',
      confidence: classifierDefaults.minRouteOverrideConfidence - 0.01,
      riskFlags: ['needs-tests', 'needs-review', 'needs-subagents'],
      domainHints: ['dashboard'],
      reason: 'Plausible product feature, but confidence is below override threshold.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'implementation-with-tests');
  assert.equal(result.route.intent, 'implementation-with-tests');
  assert.equal(result.route.source, 'llm-classifier');
  assert.equal(result.route.classifier.authority, 'advisory');
});

test('resolveClassificationRoute preserves Chinese writing when classifier self-identifies prose safety wording', () => {
  const result = resolveClassificationRoute({
    prompt: '请帮我润色这段中文风险提示，写得安全、克制、直接。',
    output: JSON.stringify({
      intent: 'security-review',
      secondaryIntents: ['writing.zh'],
      language: 'zh',
      confidence: 0.96,
      riskFlags: ['needs-security-review', 'needs-writing-qa', 'needs-subagents'],
      domainHints: ['risk wording', 'Chinese prose'],
      reason: 'The task mentions safety and risk, but it is prose editing.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'writing.zh');
  assert.equal(result.route.intent, 'writing.zh');
  assert.equal(result.route.agent, 'writing-helper.zh-writer');
  assert.deepEqual(result.route.requiredSubagents.map(({ agent }) => agent), ['zh-writer', 'zh-checker']);
  assert.equal(result.route.requiredSubagents.some(({ agent }) => agent === 'ecc-security-reviewer'), false);
  assert.equal(result.route.classifier.classification.intent, 'security-review');
  assert.equal(result.route.classifier.authority, 'fallback');
});

test('resolveClassificationRoute blocks security-review override for writing fallback even without secondary intent', () => {
  for (const [prompt, expectedIntent] of [
    ['请帮我润色这段中文风险提示，写得安全、克制、直接。', 'writing.zh'],
    ['Polish this paragraph about authentication risk for a product memo.', 'writing.en'],
  ]) {
    const result = resolveClassificationRoute({
      prompt,
      output: JSON.stringify({
        intent: 'security-review',
        secondaryIntents: [],
        language: expectedIntent === 'writing.zh' ? 'zh' : 'en',
        confidence: 0.96,
        riskFlags: ['needs-security-review'],
        domainHints: ['risk wording'],
        reason: 'The task mentions safety, risk, or authentication.',
      }),
    });

    assert.equal(result.ok, true, prompt);
    assert.equal(result.fallbackRoute.intent, expectedIntent, prompt);
    assert.equal(result.route.intent, expectedIntent, prompt);
    assert.equal(result.route.requiredSubagents.some(({ agent }) => agent === 'ecc-security-reviewer'), false, prompt);
    assert.equal(result.route.classifier.authority, 'fallback', prompt);
  }
});

test('resolveClassificationRoute preserves writing reports when classifier self-identifies report writing', () => {
  for (const [prompt, classifierIntent, expectedIntent] of [
    ['请写测试报告，重点说明当前验证风险，不要生成测试代码。', 'testing', 'writing.zh'],
    ['Write a test coverage report for the release notes; do not run tests.', 'implementation-with-tests', 'writing.en'],
  ]) {
    const result = resolveClassificationRoute({
      prompt,
      output: JSON.stringify({
        intent: classifierIntent,
        secondaryIntents: [expectedIntent],
        language: expectedIntent === 'writing.zh' ? 'zh' : 'en',
        confidence: 0.96,
        riskFlags: ['needs-tests', 'needs-subagents'],
        domainHints: ['coverage report'],
        reason: 'The task mentions tests or coverage.',
      }),
    });

    assert.equal(result.ok, true, prompt);
    assert.equal(result.fallbackRoute.intent, expectedIntent, prompt);
    assert.equal(result.route.intent, expectedIntent, prompt);
    assert.equal(result.route.requiredTools.some((tool) => tool.startsWith('omp_test_')), false, prompt);
  }
});

test('resolveClassificationRoute falls back when classifier invents unsupported fields', () => {
  const result = resolveClassificationRoute({
    prompt: 'Draft an English related work paragraph and check the logic.',
    output: JSON.stringify({
      intent: 'writing.en',
      secondaryIntents: [],
      language: 'en',
      confidence: 0.91,
      riskFlags: ['needs-writing-qa'],
      domainHints: ['paper'],
      reason: 'The user asks for English prose.',
      skills: ['invented-skill'],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.route.intent, 'writing.en');
  assert.equal(result.route.source, 'natural-language');
  assert.equal(result.route.classifier.status, 'fallback');
  assert.match(result.validation.errors.join('\n'), /Unsupported classifier field: skills/);
});

test('resolveClassificationRoute rejects out-of-range classifier confidence', () => {
  const result = resolveClassificationRoute({
    prompt: 'Draft an English related work paragraph and check the logic.',
    output: JSON.stringify({
      intent: 'writing.en',
      secondaryIntents: [],
      language: 'en',
      confidence: 1.5,
      riskFlags: ['needs-writing-qa'],
      domainHints: [],
      reason: 'English writing request.',
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.validation.errors.join('\n'), /Invalid confidence/);
});

test('resolveClassificationRoute falls back instead of throwing on invalid collection types', () => {
  const result = resolveClassificationRoute({
    prompt: 'Draft an English paragraph.',
    output: JSON.stringify({
      operationHint: 'modify',
      domains: 7,
      phaseHints: false,
      language: 'en',
      confidence: 0.9,
      riskFlags: { unsafe: true },
      reason: 'Malformed descriptor hints.',
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.route.classifier.status, 'fallback');
  assert.match(result.validation.errors.join('\n'), /domains must be an array/);
  assert.match(result.validation.errors.join('\n'), /phaseHints must be an array/);
  assert.match(result.validation.errors.join('\n'), /riskFlags must be an array/);
});
