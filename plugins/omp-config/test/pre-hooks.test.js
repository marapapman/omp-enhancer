import test from 'node:test';
import assert from 'node:assert/strict';

import registerDestructiveCommandAdvisory from '../hooks/pre/guard-destructive.ts';
import registerEditAnchorAdvisory from '../hooks/pre/opencode-deepseek-edit-anchor.ts';

function registeredToolCallHandler(factory) {
  let handler = null;
  factory({
    on(event, candidate) {
      assert.equal(event, 'tool_call');
      handler = candidate;
    },
  });
  assert.equal(typeof handler, 'function');
  return handler;
}

function warningContext(warnings) {
  return {
    ui: {
      notify(message, level) {
        warnings.push({ message, level });
      },
    },
  };
}

test('destructive command hook warns without blocking the bash tool call', async () => {
  const warnings = [];
  const handler = registeredToolCallHandler(registerDestructiveCommandAdvisory);

  const result = await handler(
    { toolName: 'bash', input: { command: 'rm -rf /' } },
    warningContext(warnings),
  );

  assert.equal(result, undefined);
  assert.deepEqual(warnings, [{
    message: 'Destructive rm detected. Advisory only: verify the exact target, backups, and host approval before proceeding.',
    level: 'warning',
  }]);
  assert.equal(await handler(
    { toolName: 'bash', input: { command: 'npm test' } },
    warningContext(warnings),
  ), undefined);
  assert.equal(warnings.length, 1);
});

test('edit anchor hook warns without blocking malformed edit anchors', async () => {
  const warnings = [];
  const handler = registeredToolCallHandler(registerEditAnchorAdvisory);

  const result = await handler(
    { toolName: 'edit', input: { input: '@@ src/index.ts\n≔ 5\nreplacement' } },
    warningContext(warnings),
  );

  assert.equal(result, undefined);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].level, 'warning');
  assert.match(warnings[0].message, /锚点 "5" 缺少 hash 后缀/);
  assert.match(warnings[0].message, /仅供参考，不会阻止工具调用/);
});
