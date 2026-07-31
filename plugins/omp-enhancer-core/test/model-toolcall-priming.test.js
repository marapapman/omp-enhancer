import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildToolCallPrimingSection,
  shouldPrimeToolCalls,
} from '../src/model-toolcall-priming.js';
import {
  buildStagedWorkflowReminder,
} from '../index.js';

test('shouldPrimeToolCalls matches known tool-call-struggling model families', () => {
  for (const model of [
    { provider: 'opencode-go', id: 'mimo-v2.5' },
    { provider: 'xiaomi', id: 'mimo-v2.5' },
    { provider: 'opencode-go', id: 'mimo-v2.5-pro' },
    { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    { provider: 'another-provider', id: 'deepseek-v4-flash-pro' },
    { provider: 'moonshotai', id: 'kimi-k2.6' },
    { provider: 'step', id: 'step-3.7-flash' },
  ]) {
    assert.equal(shouldPrimeToolCalls(model), true, `${model.provider}/${model.id} should prime`);
  }
});

test('shouldPrimeToolCalls does not match capable or unknown model families', () => {
  for (const model of [
    { provider: 'foo', id: 'bar' },
    { provider: 'anthropic', id: 'claude-opus-4' },
    { provider: 'openai', id: 'gpt-5' },
    { provider: 'google', id: 'gemini-2.5-pro' },
    { provider: 'foo', id: 'claude-3.7-sonnet' },
    { id: 'bar' },
    null,
    undefined,
    {},
  ]) {
    assert.equal(shouldPrimeToolCalls(model), false);
  }
});

test('shouldPrimeToolCalls is case-insensitive and trims gracefully', () => {
  assert.equal(shouldPrimeToolCalls({ provider: 'Xiaomi', id: 'MiMo-V2.5' }), true);
  assert.equal(shouldPrimeToolCalls({ provider: '  ', id: '  ' }), false);
  assert.equal(shouldPrimeToolCalls({ provider: '', id: '' }), false);
});

test('buildToolCallPrimingSection is advisory, never names a model, and never gates', () => {
  const section = buildToolCallPrimingSection();
  assert.match(section, /^TOOL_CALL_PRIMING \(soft, model-adaptive\):/u);
  assert.match(section, /real tool call/iu);
  assert.match(section, /issue it/iu);
  assert.match(section, /smallest viable tool call/iu);
  assert.match(section, /Advisory only/iu);
  assert.match(section, /never blocks, routes, retries, or completes/iu);
  assert.match(section, /OMP owns tools, permissions, delegation, and completion/iu);
  assert.doesNotMatch(section, /mimo|deepseek|kimi|step-3\.7|xiaomi|opencode-go/iu);
  assert.doesNotMatch(section, /block:\s*true|continue:\s*true|hard router|hard gate|required fork|automatic retry/iu);
});

// ── Integration: buildStagedWorkflowReminder injects priming based on model ──

const REMINDER_BASE = {
  hasNativeTask: true,
  subagentsAllowed: true,
  implementationDelegationAllowed: true,
};

function reminderFeatures(model) {
  const result = buildStagedWorkflowReminder({ ...REMINDER_BASE, model });
  return result?.features ?? [];
}

function reminderContent(model) {
  const result = buildStagedWorkflowReminder({ ...REMINDER_BASE, model });
  return result?.content ?? '';
}

test('priming is injected when model matches a known family', () => {
  for (const model of [
    { provider: 'opencode-go', id: 'mimo-v2.5' },
    { provider: 'xiaomi', id: 'mimo-v2.5-pro' },
    { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    { provider: 'moonshotai', id: 'kimi-k2.6' },
    { provider: 'step', id: 'step-3.7-flash' },
  ]) {
    const features = reminderFeatures(model);
    assert.ok(
      features.includes('tool-call-priming'),
      `${model.provider}/${model.id} should include tool-call-priming feature`,
    );
    const content = reminderContent(model);
    assert.match(content, /TOOL_CALL_PRIMING/u, `${model.provider}/${model.id} should have priming section in content`);
  }
});

test('priming is NOT injected when model does not match any family', () => {
  for (const model of [
    { provider: 'anthropic', id: 'claude-opus-4' },
    { provider: 'openai', id: 'gpt-5' },
    { provider: 'google', id: 'gemini-2.5-pro' },
    { provider: 'foo', id: 'claude-3.7-sonnet' },
  ]) {
    const features = reminderFeatures(model);
    assert.ok(
      !features.includes('tool-call-priming'),
      `${model.provider}/${model.id} should NOT include tool-call-priming feature`,
    );
    const content = reminderContent(model);
    assert.doesNotMatch(content, /TOOL_CALL_PRIMING/u, `${model.provider}/${model.id} should NOT have priming section`);
  }
});

test('priming is NOT injected for null, undefined, or empty model', () => {
  for (const model of [null, undefined, {}, { provider: '', id: '' }]) {
    const features = reminderFeatures(model);
    assert.ok(
      !features.includes('tool-call-priming'),
      `model=${JSON.stringify(model)} should NOT include tool-call-priming feature`,
    );
  }
});

test('priming section content is model-agnostic and advisory', () => {
  const content = reminderContent({ provider: 'opencode-go', id: 'mimo-v2.5' });
  assert.match(content, /TOOL_CALL_PRIMING \(soft, model-adaptive\):/u);
  assert.match(content, /Advisory only/u);
  assert.match(content, /never blocks, routes, retries, or completes/u);
  assert.match(content, /OMP owns tools, permissions, delegation, and completion/u);
  assert.doesNotMatch(content, /mimo|deepseek|kimi|xiaomi|opencode-go/iu);
});

test('priming feature coexists with other reminder features', () => {
  const result = buildStagedWorkflowReminder({
    ...REMINDER_BASE,
    model: { provider: 'opencode-go', id: 'mimo-v2.5' },
    hasWorkflowSkill: true,
    workflowIndexSupplied: true,
  });
  assert.ok(result, 'should return a reminder');
  assert.ok(result.features.includes('tool-call-priming'), 'should have priming');
  assert.ok(result.features.includes('skill-discovery'), 'should have skill-discovery');
  assert.ok(result.features.includes('workflow-selection'), 'should have workflow-selection');
  assert.ok(result.features.includes('delegation-decision'), 'should have delegation-decision');
});

test('extended model families match for priming', () => {
  for (const model of [
    { provider: 'volcengine-agent-plan', id: 'glm-5.2' },
    { provider: 'deepseek', id: 'deepseek-v4-flash' },
    { provider: 'moonshotai', id: 'qwen-72b-chat' },
    { provider: 'minimax', id: 'minimax-text-01' },
    { provider: 'step', id: 'step-3.7-flash' },
  ]) {
    assert.equal(shouldPrimeToolCalls(model), true, `${model.provider}/${model.id} should prime`);
  }
});