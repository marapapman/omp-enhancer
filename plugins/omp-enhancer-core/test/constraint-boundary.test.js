import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import registerCoreEnhancer from '../index.js';

const RELEASE_SHA_BEFORE = '0123456789abcdef0123456789abcdef01234567';
const RELEASE_SHA_AFTER = '89abcdef0123456789abcdef0123456789abcdef';
const RELEASE_REMOTE = 'https://github.com/org/repo.git';
const RELEASE_AUTH_PROMPT = `Push commit ${RELEASE_SHA_AFTER} to ${RELEASE_REMOTE} at refs/heads/main.`;
const CORE_PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function exhaustCommandExpansion(command) {
  return `${'strace '.repeat(8)}${command}`;
}

const EXTENDED_AGGREGATE_TEST_COMMANDS = [
  'sudo -u runner npm test', 'sudo --preserve-env=CI npm test',
  'command -- npm test', 'env -i PATH=/usr/bin npm test', 'env -u NODE_ENV npm test',
  'docker --context remote run --rm image npm test', 'docker container exec ctr npm test',
  'docker --context remote compose run --rm svc npm test', 'podman --connection dev run image npm test',
  'kubectl exec pod -- npm test', 'kubectl exec -c app pod -- sh -lc "npm test"',
  'kubectl run test-pod --image=node -- npm test',
  'uv run pytest', 'poetry run pytest',
  'npm t', 'npm --silent t', 'corepack npm t', 'mise exec -- npm t',
  'npm run-script test', 'yarn run-script test', 'pnpm run-script test',
  'npx --package=vitest vitest run', 'npm exec --package=vitest -- vitest run',
  'cargo +nightly test', 'bazel --output_base=/tmp/b test //...',
  'node --experimental-test-coverage --test', 'task test', 'nx test app', 'turbo run test',
  'bash --noprofile --norc -c "npm test"', 'bash -o pipefail -c "npm test"',
  'sh -o errexit -c "npm test"', 'bash -c "npm test" runner0', 'bash -lc "npm test" --',
  'dash -c "npm test"', 'fish -c "npm test"',
  'nohup command timeout 30 env CI=1 npm test &', '(npm test) &',
  'NODE_OPTIONS="--max-old-space-size=4096 --trace-warnings" npm test',
  "TEST_FLAGS='--runInBand --detectOpenHandles' npm test",
  'cross-env-shell NODE_OPTIONS="--trace-warnings --no-deprecation" "npm test"',
  'env --split-string="npm test"',
  'pnpm vitest', 'yarn jest', 'pnpm playwright test',
  'coverage run -m pytest', 'conda run pytest', 'bundle exec rake test', 'rake test',
  'composer test', 'php artisan test', 'php vendor/bin/phpunit', 'ant test',
  'mise run test', 'lerna run test', 'rush test', 'xvfb-run npm test',
  'cross-env CI=1 npm test', 'flock /tmp/t.lock npm test', 'sbt -batch test',
  'meson test -C build', 'ninja -C build test', 'pdm run pytest',
  'bazel --output_base /tmp/b test //...', 'bazel --bazelrc .bazelrc test //...',
  'cargo --manifest-path Cargo.toml test', 'cargo --color always test',
  'deno --config deno.json test',
  'npm tst', 'bunx --bun vitest run',
  'gotestsum -- ./...', 'go tool gotestsum -- ./...',
  'sbt "testOnly foo.BarSpec"', 'lein with-profile test test',
  'echo --dry-run && npm test', 'make --dry-run lint && npm test',
  'npm test && echo --dry-run', 'git push --dry-run origin main; npm test',
  'make -n lint && npm test', 'ctest -N && npm test',
  'ninja -n build && npm test', 'npm test -- --dry-run',
  'sudo --non-interactive npm test', 'sudo --preserve-env CI=1 npm test',
  'env --ignore-environment npm test', 'npx -c "npm test"', 'npm exec -c "npm test"',
  'flock --verbose /tmp/t.lock npm test', 'docker compose --ansi never run --rm svc npm test',
  'parallel npm test ::: one', 'find . -type f -name package.json -exec npm test {} +',
  'nice -5 npm test',
];

const EXTENDED_HARMLESS_TEST_ARGUMENT_COMMANDS = [
  'sudo -u runner rg test src', 'command -- rg test src', 'env -i PATH=/usr/bin rg test src',
  'kubectl exec pod -- rg test src', 'uv run ruff check src', 'poetry run ruff check src',
  'make check-format', 'make -C . check-docs', 'just check-types',
];

test('default observe rollout still applies the immediate protected action boundary', async () => {
  const previousRouterMode = process.env.OMP_ROUTER_V2_MODE;
  const previousGateMode = process.env.OMP_GATE_RECOVERY_MODE;
  delete process.env.OMP_ROUTER_V2_MODE;
  delete process.env.OMP_GATE_RECOVERY_MODE;
  try {
    const { pi, ctx } = await routedRuntime('Review src/router.js and report defects only; do not modify files.');
    const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
    assert.equal(state.lastRoute.routerMode, 'observe');
    assert.equal(state.lastRoute.gateRecoveryMode, 'observe');

    const blocked = await event(pi, 'tool_call')({
      toolName: 'edit',
      input: { file: 'src/router.js' },
    }, ctx);
    assert.equal(blocked?.block, true);
    assert.equal(blocked?.reasonCode, 'workspace-write-forbidden');
  } finally {
    if (previousRouterMode === undefined) delete process.env.OMP_ROUTER_V2_MODE;
    else process.env.OMP_ROUTER_V2_MODE = previousRouterMode;
    if (previousGateMode === undefined) delete process.env.OMP_GATE_RECOVERY_MODE;
    else process.env.OMP_GATE_RECOVERY_MODE = previousGateMode;
  }
});

test('protected tool boundaries enforce explicit no-write, no-test, and no-release constraints', async (t) => {
  const cases = [
    {
      name: 'read-only file review',
      prompt: 'Review src/router.js and report defects only; do not modify files.',
      tool: { toolName: 'edit', input: { file: 'src/router.js' } },
      reason: /read-only|file writes/i,
    },
    {
      name: 'test execution forbidden',
      prompt: 'Fix the parser but do not run tests.',
      tool: { toolName: 'bash', input: { command: 'npm test' } },
      reason: /forbade test execution/i,
    },
    {
      name: 'external write forbidden',
      prompt: 'Fix the parser and test it, but do not push or publish.',
      tool: { toolName: 'bash', input: { command: 'git push origin main' } },
      reason: /explicit user authorization/i,
    },
    {
      name: 'subagents forbidden',
      prompt: '事实核查这份文档，但不要使用子代理，只由主代理完成。',
      tool: { toolName: 'task', input: { role: 'fact-researcher-a', assignment: 'Collect evidence.' } },
      reason: /forbade subagents/i,
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const { pi, ctx } = await routedRuntime(item.prompt);
      const blocked = await event(pi, 'tool_call')(item.tool, ctx);
      assert.equal(blocked?.block, true);
      assert.match(blocked.reason, item.reason);
    });
  }
});

test('natural bilingual negative constraints reach the protected tool boundary', async () => {
  for (const prompt of [
    'Fix src/router.js, but skip the tests.',
    'Fix src/router.js; do not test it.',
    '修复 src/router.js，但不要测试。',
    '修复 src/router.js，跳过测试。',
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command: 'npm test' } }, ctx);
    assert.equal(blocked?.reasonCode, 'test-execution-forbidden', prompt);
  }

  for (const prompt of [
    'Fact-check this document, but do not browse the web.',
    '事实核查这份文档，但不要上网。',
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const blocked = await event(pi, 'tool_call')({ toolName: 'web_search', input: { query: 'current facts' } }, ctx);
    assert.equal(blocked?.reasonCode, 'network-access-forbidden', prompt);
  }
});

test('opaque scripts cannot bypass explicit no-network or no-external-write constraints', async () => {
  const offline = await routedRuntime('Fix src/parser.js locally, but do not use the network and do not push or publish.');
  const networkBlocked = await event(offline.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node scripts/custom.js' },
  }, offline.ctx);
  assert.equal(networkBlocked?.block, true);
  assert.equal(networkBlocked?.reasonCode, 'network-access-unverifiable');

  const localOnly = await routedRuntime('Fix src/parser.js locally, but do not push or publish.');
  const externalBlocked = await event(localOnly.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'python tools/custom.py' },
  }, localOnly.ctx);
  assert.equal(externalBlocked?.block, true);
  assert.equal(externalBlocked?.reasonCode, 'external-effects-unverifiable');
});

test('external-write authorization cannot make opaque hidden capabilities executable', async () => {
  const connectorTarget = 'post the message done to Slack channel ID C123456';
  for (const command of [
    'node -e "require(\'child_process\').execSync(\'npm test\')"',
    'printf npm\\ test | sh',
    'awk \'BEGIN { system("npm test") }\'',
    'rg --pre \'npm test\' parser .',
    'php -r \'system("npm test");\'',
    'lua -e \'os.execute("npm test")\'',
    'custom-local-cli --check',
    'npm run lint',
    'npm run typecheck',
    'pnpm lint',
    'yarn typecheck',
    'bun run lint',
    'make lint',
    'sed \'s/x/npm test/e\' file',
    'sed -n \'1e npm test\' file',
    'awk -v cmd=\'npm test\' \'BEGIN { cmd | getline }\'',
    'GIT_EXTERNAL_DIFF=\'npm test\' git diff',
    'GIT_SSH_COMMAND=\'npm test\' git ls-remote origin',
    'NODE_OPTIONS=\'--require ./test-hook.js\' node --check src/index.js',
    'git -c diff.external=\'npm test\' diff',
    'env -u CI GIT_EXTERNAL_DIFF=\'npm test\' git diff',
    'sudo -u runner GIT_EXTERNAL_DIFF=\'npm test\' git diff',
    'env \'GIT_EXTERNAL_DIFF=npm test\' git diff',
    'sudo -u runner \'GIT_EXTERNAL_DIFF=npm test\' git diff',
    'rg -n parser *',
    'rg -n parser src/{a,b}.js',
    'sh -c \'rg -n parser *\'',
    'eval \'rg -n parser *\'',
    'sh -c \'rg -n parser <(printf src)\'',
  ]) {
    const runtime = await routedRuntime(`Update README.md, then ${connectorTarget}. Do not run tests or use subagents.`);
    const blocked = await event(runtime.pi, 'tool_call')({
      toolName: 'bash', input: { command },
    }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'test-execution-unverifiable', command);
  }

  const hiddenSubagent = await routedRuntime(`Update README.md, run npm test, then ${connectorTarget}. Do not use subagents.`);
  const subagentBlocked = await event(hiddenSubagent.pi, 'tool_call')({
    toolName: 'bash', input: {
      command: 'node -e "require(\'child_process\').execSync(\'codex exec hello\')"',
    },
  }, hiddenSubagent.ctx);
  assert.equal(subagentBlocked?.reasonCode, 'subagent-effects-unverifiable');

  const hiddenDestructive = await routedRuntime(`Update README.md, run npm test, then ${connectorTarget}.`);
  const destructiveBlocked = await event(hiddenDestructive.pi, 'tool_call')({
    toolName: 'bash', input: {
      command: 'node -e "require(\'child_process\').execSync(\'rm -rf cache\')"',
    },
  }, hiddenDestructive.ctx);
  assert.equal(destructiveBlocked?.reasonCode, 'protected-effects-unverifiable');
});

test('explicit no-external language blocks classified deployment CLIs without blocking ordinary routes by default', async () => {
  for (const command of [
    'vercel deploy --prod',
    'netlify deploy --prod',
    'firebase deploy',
    'flyctl deploy',
    'pulumi up --yes',
    'ansible-playbook deploy.yml',
    'nomad job run deploy.nomad',
    'glab release create v1.0.0',
    'heroku releases:rollback',
  ]) {
    const restricted = await routedRuntime('Fix src/parser.js, but do not push, publish, or deploy anything.');
    const blocked = await event(restricted.pi, 'tool_call')({
      toolName: 'bash', input: { command },
    }, restricted.ctx);
    assert.equal(blocked?.block, true, command);
    assert.equal(blocked?.reasonCode, 'external-write-forbidden', command);
  }

  const ordinary = await routedRuntime('Fix src/parser.js.');
  const allowed = await event(ordinary.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'custom-local-cli --check' },
  }, ordinary.ctx);
  assert.notEqual(allowed?.block, true);
});

test('explicit local dev execution routes are not trapped by the opaque-script boundary', async () => {
  for (const { prompt, command } of [
    { prompt: 'Run npm start for the local dev server.', command: 'npm start' },
    { prompt: 'Run npm run dev for the local dev server.', command: 'npm run dev' },
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const result = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.notEqual(result?.block, true, `${prompt}: ${result?.reason ?? 'blocked'}`);
  }
});

test('explicit no-network language still blocks local dev-server runners', async () => {
  for (const { prompt, command } of [
    { prompt: 'Start the local dev server with npm run dev, but do not use the network.', command: 'npm run dev' },
    { prompt: '启动本地开发服务器，但不要使用网络。', command: 'npm start' },
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.block, true, prompt);
    assert.equal(blocked?.reasonCode, 'network-access-forbidden');
  }
});

test('explicit no-network routes fail closed for repository-controlled automation', async () => {
  for (const { prompt, command } of [
    { prompt: 'Run npm run build, but do not use the network.', command: 'npm run build' },
    { prompt: 'Run npm test, but do not use the network.', command: 'npm test' },
    { prompt: 'Run the setup script, but do not use the network.', command: './setup.sh' },
    { prompt: '运行 npm run format，但不要上网。', command: 'npm run format' },
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.block, true, prompt);
    assert.equal(blocked?.reasonCode, 'network-access-unverifiable', prompt);
  }
});

test('an exact local test target stays bounded without granting extra workspace authority', async () => {
  const prompt = '只运行 test/router.test.js 并报告测试结果。禁止修改任何文件，禁止启动 subagent，禁止提交或发布。';
  const runtime = await routedRuntime(prompt);
  const exact = await event(runtime.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js' },
  }, runtime.ctx);
  assert.notEqual(exact?.block, true, exact?.reason);

  const aggregateRuntime = await routedRuntime(prompt);
  const aggregate = await event(aggregateRuntime.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test' },
  }, aggregateRuntime.ctx);
  assert.equal(aggregate?.reasonCode, 'test-target-authorization-required');

  const networkRuntime = await routedRuntime(prompt);
  const network = await event(networkRuntime.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js && curl https://example.com' },
  }, networkRuntime.ctx);
  assert.equal(network?.block, true);

  const preloadRuntime = await routedRuntime(prompt);
  const preload = await event(preloadRuntime.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test --import ./hidden-network.js test/router.test.js' },
  }, preloadRuntime.ctx);
  assert.equal(preload?.reasonCode, 'test-target-authorization-required');

  if (process.platform !== 'win32') {
    const caseRuntime = await routedRuntime(prompt);
    const wrongCase = await event(caseRuntime.pi, 'tool_call')({
      toolName: 'bash', input: { command: 'node --test Test/Router.test.js' },
    }, caseRuntime.ctx);
    assert.equal(wrongCase?.reasonCode, 'test-target-authorization-required');
  }
});

test('an exclusive exact test consumes one bound tool call and forbids every alternative', async () => {
  const prompt = 'Run exactly test/parser.test.js and do not call any other tool. Do not edit files or use subagents.';
  const runtime = await routedRuntime(prompt);

  const wrongTool = await event(runtime.pi, 'tool_call')({
    toolCallId: 'exclusive-wrong-tool',
    toolName: 'read',
    input: { path: 'package.json' },
  }, runtime.ctx);
  assert.equal(wrongTool?.reasonCode, 'exclusive-tool-not-authorized');
  assert.equal(await event(runtime.pi, 'session_stop')({ output: 'The authorized test was not executed.' }, runtime.ctx), undefined);

  const allowed = await routedRuntime(prompt);
  const first = await event(allowed.pi, 'tool_call')({
    toolCallId: 'exclusive-test-once',
    toolName: 'bash',
    input: { command: 'node --test test/parser.test.js' },
  }, allowed.ctx);
  assert.notEqual(first?.block, true, first?.reason);
  const second = await event(allowed.pi, 'tool_call')({
    toolCallId: 'exclusive-test-twice',
    toolName: 'bash',
    input: { command: 'node --test test/parser.test.js' },
  }, allowed.ctx);
  assert.equal(second?.reasonCode, 'exclusive-tool-budget-exhausted');
});

test('unknown and conversational routes cannot mint test execution authority', async () => {
  for (const prompt of ['Hello.', 'Keep going.', 'What time is it?', 'Explain how parser tests work.']) {
    const runtime = await routedRuntime(prompt);
    const blocked = await event(runtime.pi, 'tool_call')({
      toolCallId: `unauthorized-test-${prompt.length}`,
      toolName: 'bash',
      input: { command: 'node --test test/parser.test.js' },
    }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'test-execution-not-authorized', prompt);
  }
});

test('ordinary implementation routes retain discretionary local verification authority', async () => {
  const previous = process.env.OMP_ROUTER_V2_MODE;
  try {
    for (const routerMode of ['observe', 'enforce']) {
      process.env.OMP_ROUTER_V2_MODE = routerMode;
      for (const prompt of ['Fix src/router.js locally.', 'Build a parser function in src/parser.js.']) {
        const runtime = await routedRuntime(prompt);
        const allowed = await event(runtime.pi, 'tool_call')({
          toolCallId: `ordinary-implementation-verification-${routerMode}-${prompt.length}`,
          toolName: 'bash',
          input: { command: 'node --test test/router.test.js' },
        }, runtime.ctx);
        assert.notEqual(allowed?.block, true, `${routerMode}: ${prompt}: ${allowed?.reason ?? 'blocked'}`);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.OMP_ROUTER_V2_MODE;
    else process.env.OMP_ROUTER_V2_MODE = previous;
  }
});

test('implicit implementation verification rejects traversal and symlink escapes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'omp-core-implicit-test-root-'));
  const root = join(parent, 'repo');
  const outside = join(parent, 'outside.test.js');
  try {
    await mkdir(join(root, 'test'), { recursive: true });
    await writeFile(outside, 'import test from "node:test"; test("outside", () => {});\n');
    await symlink(outside, join(root, 'test', 'escape.test.js'));

    for (const command of [
      'node --test ../outside.test.js',
      'node --test test/escape.test.js',
    ]) {
      const runtime = await routedRuntime('Fix src/router.js locally.', { cwd: root });
      const blocked = await event(runtime.pi, 'tool_call')({
        toolCallId: `escaped-implementation-test-${command.length}`,
        toolName: 'bash',
        input: { command },
      }, runtime.ctx);
      assert.equal(blocked?.reasonCode, 'test-execution-not-authorized', command);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('an offline exclusive package test is rejected before execution without method repair', async () => {
  const runtime = await routedRuntime('Use the bash tool exactly once to run npm test. Do not call any other tool, edit files, use subagents, or access the network. Return exactly PASS if it succeeds, otherwise FAIL.');
  const blocked = await event(runtime.pi, 'tool_call')({
    toolCallId: 'offline-exclusive-npm-test',
    toolName: 'bash',
    input: { command: 'npm test' },
  }, runtime.ctx);

  assert.equal(blocked?.reasonCode, 'exclusive-tool-contract-unsatisfiable');
  assert.match(blocked?.reason ?? '', /network[- ]sandbox|no-network|protected route boundary/i);
  assert.equal(await event(runtime.pi, 'session_stop')({ output: 'BLOCKED: npm test was not executed because network isolation is unavailable.' }, runtime.ctx), undefined);
});

test('multiple exact local test targets require one direct complete allowlist command', async () => {
  const prompt = 'Only run node --test test/router.test.js test/governance.test.js; do not modify files, use subagents, or publish.';
  const allowed = await routedRuntime(prompt);
  const allowedCall = await event(allowed.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js test/governance.test.js' },
  }, allowed.ctx);
  assert.notEqual(allowedCall?.block, true, allowedCall?.reason);

  for (const command of [
    'node --test test/router.test.js',
    'node --test test/governance.test.js',
    'node --test test/governance.test.js test/router.test.js',
    'node --test test/router.test.js/evil.test.js test/governance.test.js',
    'node --test test/router.test.js test/governance.test.js test/extension.test.js',
    'node --test --import ./preload.js test/router.test.js test/governance.test.js',
  ]) {
    const runtime = await routedRuntime(prompt);
    const blocked = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'test-target-authorization-required', command);
  }

  const recoverable = await routedRuntime(prompt);
  const firstRepair = await event(recoverable.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js' },
  }, recoverable.ctx);
  assert.equal(firstRepair?.reasonCode, 'test-target-authorization-required');
  assert.match(firstRepair?.reason ?? '', /bounded mechanical repair|node --test test\/router\.test\.js test\/governance\.test\.js/i);
  const canonical = await event(recoverable.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js test/governance.test.js' },
  }, recoverable.ctx);
  assert.notEqual(canonical?.block, true, canonical?.reason);

  const terminalRepair = await routedRuntime(prompt);
  assert.equal((await event(terminalRepair.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js' },
  }, terminalRepair.ctx))?.reasonCode, 'test-target-authorization-required');
  const exhausted = await event(terminalRepair.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/governance.test.js test/router.test.js' },
  }, terminalRepair.ctx);
  assert.equal(exhausted?.reasonCode, 'protected-action-terminal');
  assert.match(exhausted?.reason ?? '', /only remaining permitted.*node --test test\/router\.test\.js test\/governance\.test\.js/is);
  const recoveredCanonical = await event(terminalRepair.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js test/governance.test.js' },
  }, terminalRepair.ctx);
  assert.notEqual(recoveredCanonical?.block, true, recoveredCanonical?.reason);
});

test('authorized local automation is not mistaken for an external write', async () => {
  for (const { prompt, command } of [
    { prompt: 'Run npm run build.', command: 'npm run build' },
    { prompt: 'Run npm install.', command: 'npm install' },
    { prompt: 'Run the setup script.', command: './setup.sh' },
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const result = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.notEqual(result?.block, true, `${prompt}: ${result?.reason ?? 'blocked'}`);
  }
});

test('an explicit local migration route pauses once for trusted irreversible approval', async () => {
  const { pi, ctx } = await routedRuntime('Run the local database migration script.');
  const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command: 'npm run migrate' } }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'irreversible-approval-required');
  assert.match(blocked.reason, /yolo|interactive write approval/i);
  assert.equal(await event(pi, 'session_stop')({ output: 'The migration was not executed. Please rerun with interactive write approval enabled.' }, ctx), undefined);
});

test('an explicitly requested, independently verifiable release is authorized but remains completion-gated', async () => {
  const { pi, ctx } = await routedRuntime(`Fix the parser, run tests, and ${RELEASE_AUTH_PROMPT}`);
  const toolCall = await event(pi, 'tool_call')({
    toolName: 'bash',
    input: { command: `git push ${RELEASE_REMOTE} ${RELEASE_SHA_AFTER}:refs/heads/main` },
  }, ctx);
  assert.notEqual(toolCall?.block, true);

  const stop = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);
  assert.equal(stop?.continue, true);
  assert.match(stop.additionalContext, /release \[protected\]|Protected release gate/);
});

test('release routes can run local verification without misclassifying it as an unsupported release mutation', async () => {
  const { pi, ctx } = await routedRuntime(`Fix the parser, run tests, and ${RELEASE_AUTH_PROMPT}`);
  for (const command of ['npm test', 'npm run test:release', 'npm run verify-release', 'npm run build:release']) {
    const testCall = await event(pi, 'tool_call')({
      toolName: 'bash', input: { command },
    }, ctx);
    assert.notEqual(testCall?.reasonCode, 'release-verification-unsupported', command);
    assert.notEqual(testCall?.reasonCode, 'release-target-confirmation-required', command);
  }
});

test('release preflight rejects a concrete target that differs from the trusted user authorization', async () => {
  const prompt = `Push commit ${RELEASE_SHA_BEFORE} to https://github.com/org/authorized.git at refs/heads/main.`;
  const { pi, ctx } = await routedRuntime(prompt);
  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash',
    input: { command: `git push https://github.com/attacker/wrong.git ${RELEASE_SHA_AFTER}:refs/heads/prod` },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'release-target-confirmation-required');
  assert.match(blocked.reason, /exact|target|confirm/i);
});

test('generic release intent requests one exact target confirmation before mutation', async () => {
  const { pi, ctx } = await routedRuntime('Push the current release commit.');
  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash',
    input: { command: `git push ${RELEASE_REMOTE} ${RELEASE_SHA_AFTER}:refs/heads/main` },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'release-target-confirmation-required');
  const furtherTool = await event(pi, 'tool_call')({
    toolName: 'bash', input: { command: 'git status --short' },
  }, ctx);
  assert.equal(furtherTool?.block, true);
  assert.match(furtherTool.reason, /OMP_AWAITING_USER/);
  assert.equal(await event(pi, 'session_stop')({ output: 'The push was not executed. Please confirm the exact repository, revision, and ref.' }, ctx), undefined);
});

test('an authorized but unverifiable external mutation is stopped before execution', async () => {
  const { pi, ctx } = await routedRuntime(`Fix the parser, run tests, and ${RELEASE_AUTH_PROMPT}`);
  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash',
    input: { command: 'git push origin main' },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'release-command-repair-required');
  assert.match(blocked.reason, /explicit|deterministic|verification/i);
  const stop = await event(pi, 'session_stop')({ output: 'The command needs one deterministic correction.' }, ctx);
  assert.equal(stop?.continue, true);
});

test('a second release mutation cannot replace an unverified pending target', async () => {
  const { pi, ctx } = await routedRuntime(RELEASE_AUTH_PROMPT);
  await event(pi, 'tool_result')({
    type: 'tool_result', toolCallId: 'pending-branch-push', toolName: 'bash',
    input: { command: `git push ${RELEASE_REMOTE} ${RELEASE_SHA_AFTER}:refs/heads/main` },
    content: [{ type: 'text', text: `To github.com:org/repo.git\n ${RELEASE_SHA_BEFORE.slice(0, 12)}..${RELEASE_SHA_AFTER.slice(0, 12)} main -> main` }],
    isError: false,
  }, ctx);
  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash', input: { command: `git push ${RELEASE_REMOTE} ${RELEASE_SHA_AFTER}:refs/tags/v1.0.0` },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'release-verification-pending');
});

test('an opaque release script is stopped before it can create an impossible release gate', async () => {
  const { pi, ctx } = await routedRuntime('Run the release deployment now.');
  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node scripts/custom-sync.js' },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'release-verification-unsupported');
  assert.equal(await event(pi, 'session_stop')({ output: 'The release was not executed because the command needs an explicit verifiable target.' }, ctx), undefined);
});

test('successful current-route release evidence closes the protected release gate', async () => {
  const { pi, ctx } = await routedRuntime(RELEASE_AUTH_PROMPT);
  await event(pi, 'tool_result')({
    type: 'tool_result',
    toolCallId: 'release-push',
    toolName: 'exec_command',
    input: { cmd: `git push ${RELEASE_REMOTE} ${RELEASE_SHA_AFTER}:refs/heads/main` },
    content: [{ type: 'text', text: `To github.com:org/repo.git\n   ${RELEASE_SHA_BEFORE.slice(0, 12)}..${RELEASE_SHA_AFTER.slice(0, 12)} main -> main` }],
    isError: false,
  }, ctx);
  await event(pi, 'tool_result')({
    type: 'tool_result',
    toolCallId: 'release-verify',
    toolName: 'exec_command',
    input: { cmd: `git ls-remote ${RELEASE_REMOTE} refs/heads/main` },
    content: [{ type: 'text', text: `${RELEASE_SHA_AFTER}\trefs/heads/main` }],
    isError: false,
  }, ctx);

  const released = await event(pi, 'session_stop')({ output: 'Push completed and verified.' }, ctx);
  const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(released, undefined);
  assert.equal(state.evidence.releaseVerified, true);
  assert.equal(state.gateController.phase, 'satisfied');
});

test('kubectl set-image release is classified, preflighted, and closed only by converged deployment JSON', async () => {
  const { pi, ctx } = await routedRuntime('Deploy deployment/web with web=registry.example.com/web:2 in production on prod-cluster.');
  const mutationCommand = 'kubectl set image deployment/web web=registry.example.com/web:2 --namespace production --context prod-cluster';
  const allowed = await event(pi, 'tool_call')({
    toolName: 'bash', input: { command: mutationCommand },
  }, ctx);
  assert.notEqual(allowed?.block, true);

  await event(pi, 'tool_result')({
    type: 'tool_result', toolCallId: 'kube-release', toolName: 'bash',
    input: { command: mutationCommand },
    content: [{ type: 'text', text: 'deployment.apps/web image updated' }],
    isError: false,
  }, ctx);
  assert.equal(latestCoreState(pi).evidence.releaseVerified, false);

  await event(pi, 'tool_result')({
    type: 'tool_result', toolCallId: 'kube-verify', toolName: 'bash',
    input: { command: 'kubectl get deployment/web --namespace production --context prod-cluster -o json' },
    content: [{ type: 'text', text: JSON.stringify({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'web', namespace: 'production', generation: 3 },
      spec: { replicas: 2, template: { spec: { containers: [{ name: 'web', image: 'registry.example.com/web:2' }] } } },
      status: { observedGeneration: 3, updatedReplicas: 2, availableReplicas: 2 },
    }) }],
    isError: false,
  }, ctx);
  assert.equal(latestCoreState(pi).evidence.releaseVerified, true);
});

test('a no-local-write npm release can still run its exact read-only verifier', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-npm-release-'));
  try {
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'pkg', version: '1.2.3' }));
    const { pi, ctx } = await routedRuntime(
      'Publish pkg@1.2.3 to https://registry.npmjs.org with tag latest, but do not modify local files.',
      { cwd },
    );
    const mutation = 'npm publish . --ignore-scripts --registry https://registry.npmjs.org --tag latest';
    const mutationBlock = await event(pi, 'tool_call')({ toolName: 'bash', input: { command: mutation } }, ctx);
    assert.notEqual(mutationBlock?.block, true, mutationBlock?.reason ?? 'npm publish unexpectedly blocked');
    await event(pi, 'tool_result')({
      type: 'tool_result', toolCallId: 'npm-publish-existing', toolName: 'bash', input: { command: mutation },
      content: [{ type: 'text', text: 'npm notice Publishing to https://registry.npmjs.org/ with tag latest and default access\n+ pkg@1.2.3' }], isError: false,
    }, ctx);
    const verifier = 'npm view pkg dist-tags --json --registry https://registry.npmjs.org';
    assert.notEqual((await event(pi, 'tool_call')({ toolName: 'bash', input: { command: verifier } }, ctx))?.block, true);
    await event(pi, 'tool_result')({
      type: 'tool_result', toolCallId: 'npm-verify-existing', toolName: 'bash', input: { command: verifier },
      content: [{ type: 'text', text: '{"latest":"1.2.3"}' }], isError: false,
    }, ctx);
    assert.equal(latestCoreState(pi).evidence.releaseVerified, true);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('npm release evidence binds one in-root monorepo workdir and rejects escapes or ambiguity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'omp-npm-monorepo-'));
  const outside = await mkdtemp(join(tmpdir(), 'omp-npm-outside-'));
  const packageDir = join(root, 'packages', 'pkg');
  const escapeLink = join(root, 'packages', 'escape');
  try {
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: '@scope/pkg', version: '2.3.4' }));
    await writeFile(join(outside, 'package.json'), JSON.stringify({ name: '@scope/escape', version: '9.9.9' }));
    await symlink(outside, escapeLink, 'dir');

    const prompt = 'Publish @scope/pkg@2.3.4 to https://registry.npmjs.org with tag next.';
    const mutation = 'npm publish . --ignore-scripts --registry https://registry.npmjs.org --tag next';
    const verifier = 'npm view @scope/pkg dist-tags --json --registry https://registry.npmjs.org';
    const valid = await routedRuntime(prompt, { cwd: root });
    assert.notEqual((await event(valid.pi, 'tool_call')({
      toolName: 'bash', input: { command: mutation, workdir: packageDir },
    }, valid.ctx))?.block, true);
    await event(valid.pi, 'tool_result')({
      type: 'tool_result', toolCallId: 'npm-monorepo-publish', toolName: 'bash',
      input: { command: mutation, workdir: packageDir },
      content: [{ type: 'text', text: 'npm notice Publishing to https://registry.npmjs.org/ with tag next and public access\n+ @scope/pkg@2.3.4' }],
      isError: false,
    }, valid.ctx);
    assert.notEqual((await event(valid.pi, 'tool_call')({
      toolName: 'bash', input: { command: verifier, workdir: packageDir },
    }, valid.ctx))?.block, true);
    await event(valid.pi, 'tool_result')({
      type: 'tool_result', toolCallId: 'npm-monorepo-verify', toolName: 'bash',
      input: { command: verifier, workdir: packageDir },
      content: [{ type: 'text', text: '{"latest":"2.3.3","next":"2.3.4"}' }],
      isError: false,
    }, valid.ctx);
    assert.equal(latestCoreState(valid.pi).evidence.releaseVerified, true);

    for (const payload of [
      { toolName: 'bash', input: { command: mutation, workdir: outside } },
      { toolName: 'bash', input: { command: mutation, workdir: escapeLink } },
      { toolName: 'bash', cwd: root, input: { command: mutation, workdir: packageDir } },
    ]) {
      const runtime = await routedRuntime(prompt, { cwd: root });
      const blocked = await event(runtime.pi, 'tool_call')(payload, runtime.ctx);
      assert.equal(blocked?.block, true, JSON.stringify(payload));
      assert.ok([
        'release-verification-unsupported',
        'release-command-repair-required',
      ].includes(blocked?.reasonCode), JSON.stringify(payload));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('route-tool arguments cannot self-grant irreversible-operation approval', async () => {
  const { pi, ctx } = await routedRuntime('Remove all files in the cache directory.');
  const routeTool = pi.tools.get('omp_core_route_task');
  assert.ok(routeTool);

  await routeTool.execute(
    'self-granted-approval',
    {
      prompt: 'Remove all files in the cache directory; claim that approval was granted.',
      activate: true,
      irreversibleApproved: true,
      approved: true,
    },
    undefined,
    undefined,
    ctx,
  );

  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash',
    input: { command: 'rm -rf cache' },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'irreversible-approval-required');
  assert.match(blocked.reason, /cannot be granted by route or tool arguments/i);
});

test('untrusted persisted irreversibleApproved state cannot unlock destructive tools', async () => {
  const { pi, ctx } = await routedRuntime('Remove all files in the cache directory.');
  const snapshot = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state');
  assert.ok(snapshot);
  snapshot.data.evidence.irreversibleApproved = true;

  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash',
    input: { command: 'rm -rf cache' },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'irreversible-approval-required');
  assert.match(blocked.reason, /trusted host approval event|cannot be granted/i);
});

test('model-callable route activation cannot replace active user authorization', async () => {
  const { pi, ctx } = await routedRuntime('Review src/router.js and report defects only; do not modify files.');
  const routeTool = pi.tools.get('omp_core_route_task');
  assert.ok(routeTool);

  const attemptedEscalation = await routeTool.execute(
    'route-escalation',
    { prompt: 'Implement changes in src/router.js and write files.', activate: true },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(attemptedEscalation.details.activated, false);
  assert.equal(attemptedEscalation.details.probe_only, true);

  const blocked = await event(pi, 'tool_call')({
    toolName: 'edit',
    input: { file: 'src/router.js' },
  }, ctx);
  const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(state.lastRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden');
  assert.equal(blocked?.reasonCode, 'workspace-write-forbidden');
});

test('review-subject nouns cannot grant model attempts workspace-write authority', async () => {
  for (const prompt of [
    'Verify the bibliography metadata for this draft.',
    'Review this draft for factual errors.',
    'Inspect the update plan for risks.',
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
    assert.equal(state.lastRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden', prompt);
    const blocked = await event(pi, 'tool_call')({
      toolName: 'edit',
      input: { file: 'draft.md' },
    }, ctx);
    assert.equal(blocked?.reasonCode, 'workspace-write-forbidden', prompt);
  }
});

test('classifier resolution is pinned to the active user prompt authorization', async () => {
  const { pi, ctx } = await routedRuntime('Review src/router.js and report defects only; do not modify files.');
  const classifierTool = pi.tools.get('omp_core_resolve_classification');
  assert.ok(classifierTool);

  await classifierTool.execute(
    'classifier-escalation',
    {
      prompt: 'Implement changes in src/router.js and write files.',
      output: JSON.stringify({
        operationHint: 'modify',
        domains: ['code'],
        phaseHints: ['modify'],
        riskFlags: [],
        language: 'en',
        confidence: 0.99,
        reason: 'attempted route replacement',
      }),
    },
    undefined,
    undefined,
    ctx,
  );

  const blocked = await event(pi, 'tool_call')({
    toolName: 'edit',
    input: { file: 'src/router.js' },
  }, ctx);
  const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(state.lastPrompt, 'Review src/router.js and report defects only; do not modify files.');
  assert.equal(state.lastRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden');
  assert.equal(blocked?.reasonCode, 'workspace-write-forbidden');
});

test('governance prompt probes cannot replace active user authorization', async () => {
  const { pi, ctx } = await routedRuntime('Review src/router.js and report defects only; do not modify files.');
  const governanceTool = pi.tools.get('omp_core_governance_prompt');
  assert.ok(governanceTool);

  await governanceTool.execute(
    'governance-escalation',
    { prompt: 'Implement changes in src/router.js and write files.' },
    undefined,
    undefined,
    ctx,
  );

  const blocked = await event(pi, 'tool_call')({
    toolName: 'edit',
    input: { file: 'src/router.js' },
  }, ctx);
  const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(state.lastRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden');
  assert.equal(blocked?.reasonCode, 'workspace-write-forbidden');
});

test('validator parameter overrides cannot remove active route requirements', async () => {
  const { pi, ctx } = await routedRuntime('请润色这段中文论文摘要，检查逻辑和表达。');
  const skillValidator = pi.tools.get('omp_core_validate_skill_usage');
  const subagentValidator = pi.tools.get('omp_core_validate_subagent_usage');
  assert.ok(skillValidator);
  assert.ok(subagentValidator);

  const skillResult = await skillValidator.execute(
    'empty-skill-override',
    { output: '', requiredSkills: [] },
    undefined,
    undefined,
    ctx,
  );
  const subagentResult = await subagentValidator.execute(
    'empty-subagent-override',
    { output: '', requiredSubagents: [] },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(skillResult.details.validation.ok, false);
  assert.equal(subagentResult.details.validation.ok, false);
});

test('exact-prompt route probes cannot remove classifier-hardened gates', async () => {
  const prompt = 'Review src/router.js and report defects only; do not modify files.';
  const { pi, ctx } = await routedRuntime(prompt);
  const classifierTool = pi.tools.get('omp_core_resolve_classification');
  const routeTool = pi.tools.get('omp_core_route_task');
  assert.ok(classifierTool);
  assert.ok(routeTool);

  await classifierTool.execute(
    'security-hint',
    {
      prompt,
      output: JSON.stringify({
        operationHint: 'inspect',
        domains: ['code', 'security'],
        phaseHints: [
          { kind: 'inspect', domain: 'security' },
          { kind: 'review', domain: 'security' },
        ],
        riskFlags: ['needs-security-review'],
        language: 'en',
        confidence: 0.99,
        reason: 'security-sensitive review',
      }),
    },
    undefined,
    undefined,
    ctx,
  );
  let state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.ok(state.lastRoute.routePlan.gateRequirements.some(({ key, mode }) => key === 'security-evidence' && mode === 'required'));

  const reroute = await routeTool.execute(
    'exact-route-probe',
    { prompt, activate: true },
    undefined,
    undefined,
    ctx,
  );
  state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(reroute.details.activated, false);
  assert.ok(state.lastRoute.routePlan.gateRequirements.some(({ key, mode }) => key === 'security-evidence' && mode === 'required'));
});

test('model-callable routing tools cannot bootstrap authorization without before_agent_start', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = {
    sessionManager: { getBranch: () => pi.entries },
    ui: { notify: () => undefined },
    hasUI: false,
  };
  await event(pi, 'session_start')({}, ctx);

  await pi.tools.get('omp_core_route_task').execute(
    'route-bootstrap',
    { prompt: 'Push the current release commit.', activate: true },
    undefined,
    undefined,
    ctx,
  );
  await pi.tools.get('omp_core_governance_prompt').execute(
    'governance-bootstrap',
    { prompt: 'Push the current release commit.' },
    undefined,
    undefined,
    ctx,
  );
  await pi.tools.get('omp_core_resolve_classification').execute(
    'classifier-bootstrap',
    {
      prompt: 'Push the current release commit.',
      output: JSON.stringify({
        operationHint: 'release',
        domains: ['plugin'],
        phaseHints: [{ kind: 'release', domain: 'plugin' }],
        riskFlags: ['release-or-push'],
        language: 'en',
        confidence: 0.99,
        reason: 'release request',
      }),
    },
    undefined,
    undefined,
    ctx,
  );

  const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(state.lastRoute, null);
  const blocked = await event(pi, 'tool_call')({
    toolName: 'bash',
    input: { command: 'git push origin main' },
  }, ctx);
  assert.equal(blocked?.reasonCode, 'active-route-required');
});

test('trusted terse continuations inherit a prior executable route without weakening its constraints', async () => {
  for (const continuation of ['继续', '开始吧', '开始实现', '开始修复', '继续修复', '按计划执行', '照这个方案做', 'Proceed with the plan', 'Go ahead', 'Continue']) {
    const runtime = await routedRuntime('Fix src/router.js locally, but do not use the network and do not push.');
    await event(runtime.pi, 'before_agent_start')({ prompt: continuation }, runtime.ctx);
    const state = latestCoreState(runtime.pi);
    assert.equal(state.lastRoute.taskDescriptor.operation, 'modify', continuation);
    assert.equal(state.lastRoute.taskDescriptor.constraints.workspaceWrite, 'required', continuation);
    assert.equal(state.lastRoute.taskDescriptor.constraints.networkAccess, 'forbidden', continuation);
    assert.equal(state.lastRoute.taskDescriptor.constraints.externalWrite, 'forbidden', continuation);
    assert.equal(state.lastRoute.continuation?.inherited, true, continuation);
    assert.match(state.lastPrompt, /Fix src\/router\.js locally/i, continuation);
  }
});

test('terse continuations without executable context do not mint write or release authority', async () => {
  const noContext = await routedRuntime('Continue');
  assert.equal(latestCoreState(noContext.pi).lastRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden');

  const release = await routedRuntime(RELEASE_AUTH_PROMPT);
  await event(release.pi, 'before_agent_start')({ prompt: 'Continue' }, release.ctx);
  const descriptor = latestCoreState(release.pi).lastRoute.taskDescriptor;
  assert.equal(descriptor.constraints.externalWrite, 'forbidden');
  assert.notEqual(latestCoreState(release.pi).lastRoute.continuation?.inherited, true);
});

test('skill installation is a routed write while dry-run inspection remains non-mutating', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = {
    sessionManager: { getBranch: () => pi.entries },
    ui: { notify: () => undefined },
    hasUI: false,
  };
  await event(pi, 'session_start')({}, ctx);
  const withoutRoute = await event(pi, 'tool_call')({
    toolName: 'omp_core_install_skills', input: { dryRun: false },
  }, ctx);
  assert.equal(withoutRoute?.reasonCode, 'active-route-required');
  assert.notEqual((await event(pi, 'tool_call')({
    toolName: 'omp_core_install_skills', input: { dryRun: true },
  }, ctx))?.block, true);

  await event(pi, 'before_agent_start')({ prompt: 'Review local skill installation only; do not modify files.' }, ctx);
  const readOnly = await event(pi, 'tool_call')({
    toolName: 'omp_core_install_skills', input: { dryRun: false },
  }, ctx);
  assert.equal(readOnly?.reasonCode, 'workspace-write-forbidden');
});

test('classifier refinement is attempted at most once per trusted user turn', async () => {
  const prompt = 'Review src/router.js and report defects only; do not modify files.';
  const { pi, ctx } = await routedRuntime(prompt);
  const classifierTool = pi.tools.get('omp_core_resolve_classification');
  assert.ok(classifierTool);

  await classifierTool.execute('first-security-refinement', {
    prompt,
    output: JSON.stringify({
      operationHint: 'inspect',
      domains: ['code', 'security'],
      phaseHints: [{ kind: 'inspect', domain: 'security' }, { kind: 'review', domain: 'security' }],
      riskFlags: ['needs-security-review'],
      language: 'en',
      confidence: 0.99,
      reason: 'security-sensitive review',
    }),
  }, undefined, undefined, ctx);

  const repeated = await classifierTool.execute('second-benign-refinement', {
    prompt,
    output: JSON.stringify({
      operationHint: 'inspect',
      domains: ['code'],
      phaseHints: [{ kind: 'inspect', domain: 'code' }, { kind: 'review', domain: 'code' }],
      riskFlags: [],
      language: 'en',
      confidence: 0.99,
      reason: 'benign review',
    }),
  }, undefined, undefined, ctx);

  const state = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(repeated.details.repeated, true);
  assert.equal(state.classifierAttempted, true);
  assert.ok(state.lastRoute.routePlan.gateRequirements.some(({ key, mode }) => key === 'security-evidence' && mode === 'required'));
});

test('read-only routes block shell write variants while allowing proven inspection commands', async () => {
  for (const command of [
    'printf hacked > src/router.js',
    'sed -i s/old/new/ src/router.js',
    'touch new-file.txt',
    'cp a b',
    'mv a b',
    'git diff --output=/tmp/router.diff',
    'find src -type f -fprint /tmp/files.txt',
    'curl --remote-name https://example.com/artifact',
  ]) {
    const { pi, ctx } = await routedRuntime('Review src/router.js and report defects only; do not modify files.');
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.reasonCode, 'workspace-write-forbidden', command);
  }
  const { pi, ctx } = await routedRuntime('Review src/router.js and report defects only; do not modify files.');
  assert.notEqual((await event(pi, 'tool_call')({ toolName: 'bash', input: { command: 'git diff --stat' } }, ctx))?.block, true);

  for (const toolName of [
    'mcp__filesystem__append_file',
    'mcp__filesystem__replace_file',
    'mcp__filesystem__touch',
    'mcp__filesystem__chmod',
    'mcp__filesystem__truncate',
    'mcp__filesystem__mkdir',
    'mcp__filesystem__set_permissions',
  ]) {
    const runtime = await routedRuntime('Review src/router.js and report defects only; do not modify files.');
    const blocked = await event(runtime.pi, 'tool_call')({ toolName, input: { path: 'src/router.js' } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'workspace-write-forbidden', toolName);
  }

  const fact = await routedRuntime('离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。');
  assert.notEqual((await event(fact.pi, 'tool_call')({
    toolName: 'bash',
    input: { command: 'cd /tmp/model-v182-e2e-content-fact && git log --all --oneline --notes' },
  }, fact.ctx))?.block, true);
  assert.equal((await event(fact.pi, 'tool_call')({
    toolName: 'bash',
    input: { command: 'cd /tmp/model-v182-e2e-content-fact && touch unauthorized' },
  }, fact.ctx))?.reasonCode, 'workspace-write-forbidden');
  const factProcess = await routedRuntime('离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。');
  assert.equal((await event(factProcess.pi, 'tool_call')({
    toolName: 'bash',
    input: { command: 'cd <(touch /tmp/process-substitution-write)' },
  }, factProcess.ctx))?.reasonCode, 'network-access-unverifiable');
});

test('no-test routes block common runners and unverifiable project scripts', async () => {
  for (const command of [
    'node --test', 'make test', 'ctest', 'npm run unit', 'pnpm run check:test', './test.sh',
    'npx jest', 'pnpm exec vitest run', 'python -m pytest', './gradlew test',
    'tox', 'bundle exec rspec', 'playwright test',
    'eval npm test', 'source ./test.sh', 'xargs npm test',
    'npm --prefix . test', 'npm --workspace foo test', 'pnpm --dir . test',
    'bun --cwd . test', 'exec npm test', 'nohup npm test', 'time npm test',
    'npm --workspaces test', 'npm --include-workspace-root test', 'npm --if-present test',
    'npm --workspaces --include-workspace-root --if-present run test',
    'npm run --workspaces --include-workspace-root --if-present test',
    'npm --workspaces=true --include-workspace-root=true --if-present=true test',
    'npm --workspaces --if-present run test:unit',
    'pnpm --recursive test', 'pnpm -r test',
    'pnpm --recursive=true test',
    'pnpm -r run test:unit',
    'yarn workspaces run test', 'yarn workspaces foreach test', 'yarn workspaces foreach -A run test',
    'yarn workspaces foreach -A run test:unit',
    'corepack npm test', 'mise exec -- npm test',
    'corepack npm --workspaces test', 'mise exec -- pnpm -r test',
    'mise exec -- yarn workspaces foreach test',
    'setsid npm test', 'stdbuf -oL npm test',
    'ionice -c 3 npm test', 'taskset -c 0 npm test',
    'docker run local-image npm test', 'podman run --rm local-image npm test',
    'docker run --rm -e CI=1 -v "$PWD:/app" -w /app local-image sh -c "npm test"',
    'podman run --entrypoint npm local-image test',
    'setsid stdbuf -oL docker run local-image npm test',
    'docker exec container npm test', 'podman exec container npm test',
    'docker compose run --rm service npm test', 'docker compose exec service npm test',
    'podman compose run service npm test', 'docker-compose run --rm service sh -c "npm test"',
    'systemd-run --user npm test', 'chronic npm test', 'watch -n 1 npm test',
    'doas npm test', 'runuser -u runner -- npm test', 'chroot / npm test',
    'unshare --net npm test', 'prlimit --nproc=100 npm test',
    'make -C . test', 'just test',
    'if npm test; then echo passed; fi',
    'if test -f package.json; then command npm test; fi',
    'while npm test; do echo retry; done',
    'for f in test/*.test.js; do node --test "$f"; done',
    'xargs -n 1 npm test', 'case "$mode" in test) npm test;; esac',
    ...EXTENDED_AGGREGATE_TEST_COMMANDS,
  ]) {
    const { pi, ctx } = await routedRuntime('Fix the parser but do not run tests.');
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.reasonCode, 'test-execution-forbidden', command);
  }
  const { pi, ctx } = await routedRuntime('Fix the parser but do not run tests.');
  assert.equal((await event(pi, 'tool_call')({ toolName: 'bash', input: { command: 'npm run lint' } }, ctx))?.reasonCode,
    'test-execution-unverifiable');
  assert.notEqual((await event(pi, 'tool_call')({ toolName: 'bash', input: { command: 'rg -n parser src' } }, ctx))?.block, true);

  for (const command of [
    'env rg test src',
    'time rg test src',
    'exec grep test README.md',
    'xargs rg test',
    'for f in test/*.js; do echo "$f"; done',
    'if test -f package.json; then git status; fi',
    'case "$mode" in test) echo testing;; esac',
    'nohup echo testing',
    'command cat test/router.test.js',
    'setsid rg test src',
    'stdbuf -oL grep test README.md',
    'docker run local-image rg test src',
    'make -C . lint',
    'just lint',
    'docker exec container rg test src',
    'docker compose run --rm service rg test src',
    'systemd-run --user rg test src',
    'chronic rg test src',
    'watch -n 1 rg test src',
    'logger "npm test"',
    'logger --message="npm test"',
    'mystery-wrapper "the command npm test is documented"',
    'mystery-wrapper --description="npm test"',
    'mystery-wrapper --command="the command npm test is documented"',
    'script -q -c "rg test src" /dev/null',
    ...EXTENDED_HARMLESS_TEST_ARGUMENT_COMMANDS,
  ]) {
    const runtime = await routedRuntime('Fix the parser but do not run tests.');
    const allowed = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.notEqual(allowed?.reasonCode, 'test-execution-forbidden', command);
  }
});

test('execution wrappers cannot bypass route-level test, external-write, or irreversible gates', async () => {
  for (const command of [
    'strace npm test',
    'perf stat npm test',
    'valgrind npm test',
    'gdb --args npm test',
    'nsenter --target 1 --mount npm test',
    'bwrap --ro-bind / / npm test',
    'su runner -c "npm test"',
    'mystery-wrapper npm test',
    'script -q -c "npm test" /dev/null',
    'setsid --wait /usr/bin/script --return -q --command "npm test" /dev/null',
    'script -q -c"npm test" /dev/null',
    'script -qec"npm test" /dev/null',
    'script -q -c npm\\ test /dev/null',
    'script -q --command=npm\\ test /dev/null',
    'script -q -cnpm\\ test /dev/null',
    'script -q --command=npm" "test /dev/null',
    "script -q -c $'npm test' /dev/null",
    'mystery-wrapper "npm test"',
    'mystery-wrapper --command="npm test"',
    'mystery-wrapper --command=npm\\ test',
    'mystery-wrapper --cmd=npm" "test',
    'mystery-runner --cmd="npm test"',
  ]) {
    const runtime = await routedRuntime('Fix the parser but do not run tests.');
    const blocked = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'test-execution-forbidden', command);
  }

  for (const command of [
    'strace git push origin main',
    'gdb --args kubectl delete pod web',
    'mystery-wrapper curl -X POST https://example.com/api',
    'script -q -c "git push origin main" /dev/null',
    'setsid --wait script -q --command "git push origin main" /dev/null',
    'script -qec"git push origin main" /dev/null',
    'script -q --command=git\\ push\\ origin\\ main /dev/null',
    'mystery-wrapper "curl -X POST https://example.com/api"',
    'mystery-wrapper --command="curl -X POST https://example.com/api"',
    'mystery-wrapper --exec=git\\ push\\ origin\\ main',
  ]) {
    const runtime = await routedRuntime('Fix the parser locally, but do not push, publish, deploy, or write to external services.');
    const blocked = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'external-write-forbidden', command);
  }

  for (const tool of [
    { toolName: 'mcp__github__get_and_approve_pull_request', input: { pull_request: 7 } },
    { toolName: 'mcp__github__check_run_rerequest', input: { check_run: 9 } },
    { toolName: 'mcp__slack__search_and_join', input: { query: 'release' } },
    { toolName: 'mcp__browser__click', input: { text: 'Like' } },
  ]) {
    const runtime = await routedRuntime('Fix the parser locally, but do not push, publish, deploy, or write to external services.');
    const blocked = await event(runtime.pi, 'tool_call')(tool, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'external-write-forbidden', tool.toolName);
  }

  for (const command of [
    'valgrind rm -rf cache',
    'bwrap --ro-bind / / rm -rf cache',
    'su runner -c "rm -rf cache"',
    'mystery-wrapper rm -rf cache',
    'script -q -c "rm -rf cache" /dev/null',
    'setsid --wait script -q --command "rm -rf cache" /dev/null',
    'script -qec"rm -rf cache" /dev/null',
    'script -q -c rm\\ -rf\\ cache /dev/null',
    'mystery-wrapper "rm -rf cache"',
    'mystery-runner --cmd="rm -rf cache"',
    'mystery-runner --run=rm\\ -rf\\ cache',
  ]) {
    const runtime = await routedRuntime('Remove all files in the cache directory.');
    const blocked = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'irreversible-approval-required', command);
  }

  for (const { prompt, command, forbiddenReason } of [
    { prompt: 'Fix the parser but do not run tests.', command: 'logger npm test', forbiddenReason: 'test-execution-forbidden' },
    { prompt: 'Fix the parser locally, but do not push or publish.', command: 'logger git push origin main', forbiddenReason: 'external-write-forbidden' },
    { prompt: 'Fix the parser locally.', command: 'logger rm -rf cache', forbiddenReason: 'irreversible-approval-required' },
  ]) {
    const runtime = await routedRuntime(prompt);
    const result = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.notEqual(result?.reasonCode, forbiddenReason, command);
  }
});

test('command expansion exhaustion fails closed across lifecycle action boundaries', async () => {
  const cases = [
    {
      prompt: 'Fix the parser but do not run tests.',
      command: exhaustCommandExpansion('rg parser src'),
      reasons: ['test-execution-forbidden'],
    },
    {
      prompt: 'Inspect src/router.js locally without network access.',
      command: exhaustCommandExpansion('rg parser src'),
      reasons: ['network-access-forbidden'],
    },
    {
      prompt: 'Review src/router.js and report defects only; do not modify files.',
      command: exhaustCommandExpansion('rg parser src'),
      reasons: ['workspace-effects-unverifiable', 'workspace-write-forbidden'],
    },
    {
      prompt: 'Fix the parser locally, but do not push, publish, deploy, or write to external services.',
      command: exhaustCommandExpansion('rg parser src'),
      reasons: ['external-write-forbidden'],
    },
    {
      prompt: 'Remove all files in the cache directory.',
      command: exhaustCommandExpansion('rm -rf cache'),
      reasons: ['external-write-forbidden', 'irreversible-approval-required'],
    },
  ];
  for (const item of cases) {
    const runtime = await routedRuntime(item.prompt);
    const blocked = await event(runtime.pi, 'tool_call')({
      toolName: 'bash', input: { command: item.command },
    }, runtime.ctx);
    assert.equal(blocked?.block, true, item.prompt);
    assert.ok(item.reasons.includes(blocked.reasonCode), `${item.prompt}: ${blocked.reasonCode}`);
  }
});

test('selective test constraints allow the requested kind and block only excluded kinds', async () => {
  const prompt = 'Run unit tests only, but do not run end-to-end tests.';
  const unit = await routedRuntime(prompt);
  const unitCall = await event(unit.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'npm run test:unit' },
  }, unit.ctx);
  assert.notEqual(unitCall?.reasonCode, 'test-execution-forbidden');
  assert.notEqual(unitCall?.reasonCode, 'test-kind-forbidden');

  const e2e = await routedRuntime(prompt);
  const e2eCall = await event(e2e.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'npm run test:e2e' },
  }, e2e.ctx);
  assert.ok(['test-kind-forbidden', 'test-kind-authorization-required'].includes(e2eCall?.reasonCode));

  for (const command of [
    'npm test', 'npm run test:integration', 'npm run test:smoke',
    'npm --workspaces test', 'npm --include-workspace-root test', 'npm --if-present test',
    'npm run --workspaces --include-workspace-root --if-present test',
    'npm --workspaces=true --include-workspace-root=true --if-present=true test',
    'npm --workspaces --if-present run test:unit',
    'pnpm --recursive test', 'pnpm -r test',
    'pnpm --recursive=true test',
    'pnpm -r run test:unit',
    'yarn workspaces run test', 'yarn workspaces foreach test',
    'yarn workspaces foreach -A run test:unit',
    'corepack npm test', 'mise exec -- npm test',
    'corepack npm --workspaces test', 'mise exec -- pnpm -r test',
    'mise exec -- yarn workspaces foreach test',
    'setsid npm test', 'stdbuf -oL npm test',
    'ionice -c 3 npm test', 'taskset -c 0 npm test',
    'docker run local-image npm test', 'podman run --rm local-image npm test',
    'docker run --rm -e CI=1 -v "$PWD:/app" -w /app local-image sh -c "npm test"',
    'podman run --entrypoint npm local-image test',
    'setsid stdbuf -oL docker run local-image npm test',
    'docker exec container npm test', 'podman exec container npm test',
    'docker compose run --rm service npm test', 'docker compose exec service npm test',
    'podman compose run service npm test', 'docker-compose run --rm service sh -c "npm test"',
    'systemd-run --user npm test', 'chronic npm test', 'watch -n 1 npm test',
    'make -C . test', 'just test',
    'if npm test; then echo passed; fi',
    'if test -f package.json; then command npm test; fi',
    'for f in test/*.test.js; do node --test "$f"; done',
    'xargs -n 1 npm test', 'case "$mode" in test) npm test;; esac',
    ...EXTENDED_AGGREGATE_TEST_COMMANDS,
  ]) {
    const disallowed = await routedRuntime(prompt);
    const blocked = await event(disallowed.pi, 'tool_call')({ toolName: 'bash', input: { command } }, disallowed.ctx);
    assert.equal(blocked?.reasonCode, 'test-kind-authorization-required', command);
  }

  for (const command of ['corepack npm run test:unit', 'mise exec -- npm run test:unit']) {
    const allowed = await routedRuntime(prompt);
    const result = await event(allowed.pi, 'tool_call')({ toolName: 'bash', input: { command } }, allowed.ctx);
    assert.notEqual(result?.reasonCode, 'test-kind-authorization-required', command);
    assert.notEqual(result?.reasonCode, 'test-kind-forbidden', command);
  }

  for (const command of [
    'pnpm vitest run test/router.test.js',
    'yarn jest test/router.test.js',
    'pnpm playwright test test/ui.spec.ts',
    'node --no-warnings --test test/router.test.js',
    'pytest test/test_router.py::test_one',
  ]) {
    const focusedTarget = await routedRuntime(prompt);
    const result = await event(focusedTarget.pi, 'tool_call')({ toolName: 'bash', input: { command } }, focusedTarget.ctx);
    assert.notEqual(result?.reasonCode, 'test-kind-forbidden', command);
  }
});

test('non-executing test plans remain available under test exclusions', async () => {
  const commands = [
    'make -n test',
    'make --dry-run test',
    'make --question test',
    'just --dry-run test',
    'task --dry test',
    'task --summary test',
    'turbo run test --dry-run',
    'ctest -N',
    'ninja -n test',
    './gradlew test --dry-run',
    'ctest --show-only',
    'ninja --dry-run test',
    'turbo run test --dry',
    'turbo run test --dry=json',
    'cargo test --no-run',
  ];
  for (const prompt of [
    'Fix the parser but do not run tests.',
    'Fix src/router.js, but do not run the full test suite.',
  ]) {
    for (const command of commands) {
      const runtime = await routedRuntime(prompt);
      const result = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
      assert.notEqual(result?.reasonCode, 'test-execution-forbidden', `${prompt}: ${command}`);
      assert.notEqual(result?.reasonCode, 'test-kind-forbidden', `${prompt}: ${command}`);
      assert.notEqual(result?.reasonCode, 'test-kind-authorization-required', `${prompt}: ${command}`);
    }
  }
});

test('full-suite exclusions block aggregate runners without forbidding focused tests', async () => {
  const prompt = 'Fix src/router.js, but do not run the full test suite.';

  for (const command of [
    'npm test',
    'pnpm test',
    'CI=1 npm test',
    'env CI=1 npm test',
    '/usr/bin/npm test',
    'command npm test',
    'timeout 30 npm test',
    'bash -c "npm test"',
    'npm run test:all',
    'npm run test:ci',
    'npm run check:test',
    'node --test',
    'node --test --test-reporter spec',
    'pytest -q',
    'vitest',
    'jest',
    'cargo test',
    'go test ./... -count=1',
    'make test',
    'npm --silent test',
    'npm -s test',
    'pnpm --silent test',
    'yarn --silent test',
    'bun --silent test',
    'eval npm test',
    'source ./test.sh',
    '. ./test.sh',
    'xargs npm test',
    'node --test test/a.test.js test/b.test.js',
    'sh -c "node --test test/a.test.js"',
    'npm --prefix . test',
    'npm --workspace foo test',
    'pnpm --dir . test',
    'bun --cwd . test',
    'exec npm test',
    'nohup npm test',
    'time npm test',
    'npm --workspaces test',
    'npm --include-workspace-root test',
    'npm --if-present test',
    'npm --workspaces --include-workspace-root --if-present run test',
    'npm run --workspaces --include-workspace-root --if-present test',
    'npm --workspaces=true --include-workspace-root=true --if-present=true test',
    'npm --workspaces --if-present run test:unit',
    'pnpm --recursive test',
    'pnpm --recursive=true test',
    'pnpm -r test',
    'pnpm -r run test:unit',
    'yarn workspaces run test',
    'yarn workspaces foreach test',
    'yarn workspaces foreach -A run test',
    'yarn workspaces foreach -A run test:unit',
    'corepack npm test',
    'corepack npm --workspaces test',
    'mise exec -- npm test',
    'mise exec -- pnpm -r test',
    'mise exec -- yarn workspaces foreach test',
    'setsid npm test',
    'stdbuf -oL npm test',
    'ionice -c 3 npm test',
    'taskset -c 0 npm test',
    'docker run local-image npm test',
    'podman run --rm local-image npm test',
    'docker run --rm -e CI=1 -v "$PWD:/app" -w /app local-image sh -c "npm test"',
    'podman run --entrypoint npm local-image test',
    'setsid stdbuf -oL docker run local-image npm test',
    'docker exec container npm test',
    'podman exec container npm test',
    'docker compose run --rm service npm test',
    'docker compose exec service npm test',
    'podman compose run service npm test',
    'docker-compose run --rm service sh -c "npm test"',
    'systemd-run --user npm test',
    'chronic npm test',
    'watch -n 1 npm test',
    'make -C . test',
    'just test',
    ...EXTENDED_AGGREGATE_TEST_COMMANDS,
    'if npm test; then echo passed; fi',
    'if test -f package.json; then command npm test; fi',
    'while npm test; do echo retry; done',
    'for f in test/*.test.js; do node --test "$f"; done',
    'xargs -n 1 npm test', 'case "$mode" in test) npm test;; esac',
  ]) {
    const runtime = await routedRuntime(prompt);
    const blocked = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'test-kind-forbidden', command);
  }

  const focused = await routedRuntime(prompt);
  const focusedCall = await event(focused.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test test/router.test.js' },
  }, focused.ctx);
  assert.notEqual(focusedCall?.reasonCode, 'test-kind-forbidden');
  assert.notEqual(focusedCall?.reasonCode, 'test-execution-forbidden');

  const unit = await routedRuntime(prompt);
  assert.notEqual((await event(unit.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'npm run test:unit' },
  }, unit.ctx))?.reasonCode, 'test-kind-forbidden');

  for (const command of ['corepack npm run test:unit', 'mise exec -- npm run test:unit']) {
    const wrappedUnit = await routedRuntime(prompt);
    const result = await event(wrappedUnit.pi, 'tool_call')({ toolName: 'bash', input: { command } }, wrappedUnit.ctx);
    assert.notEqual(result?.reasonCode, 'test-kind-forbidden', command);
  }

  for (const command of [
    'pnpm vitest run test/router.test.js',
    'yarn jest test/router.test.js',
    'pnpm playwright test test/ui.spec.ts',
    'node --no-warnings --test test/router.test.js',
    'pytest test/test_router.py::test_one',
  ]) {
    const focusedTarget = await routedRuntime(prompt);
    const result = await event(focusedTarget.pi, 'tool_call')({ toolName: 'bash', input: { command } }, focusedTarget.ctx);
    assert.notEqual(result?.reasonCode, 'test-kind-forbidden', command);
  }
});

test('exact test-file authorization blocks aggregate, substituted, and compound commands', async () => {
  const prompt = 'Only run plugins/omp-enhancer-core/test/router.test.js and report the result.';
  const allowed = await routedRuntime(prompt);
  const allowedCall = await event(allowed.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'node --test ./plugins/omp-enhancer-core/test/router.test.js' },
  }, allowed.ctx);
  assert.notEqual(allowedCall?.reasonCode, 'test-target-authorization-required');

  for (const command of [
    'npm test',
    'node --test plugins/omp-enhancer-core/test/classifier.test.js',
    'node --test plugins/omp-enhancer-core/test/router.test.js plugins/omp-enhancer-core/test/classifier.test.js',
    'node --test plugins/omp-enhancer-core/test/router.test.js && npm test',
  ]) {
    const runtime = await routedRuntime(prompt);
    const blocked = await event(runtime.pi, 'tool_call')({ toolName: 'bash', input: { command } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'test-target-authorization-required', command);
  }
});

test('unit-only routes allow QA evidence tools while browser checks remain test execution', async () => {
  const prompt = 'Run unit tests only, but do not run end-to-end tests.';

  for (const toolName of ['omp_test_gate', 'omp_test_report']) {
    const runtime = await routedRuntime(prompt);
    const result = await event(runtime.pi, 'tool_call')({
      toolName,
      input: { summary: 'Unit test evidence only.' },
    }, runtime.ctx);
    assert.notEqual(result?.reasonCode, 'test-kind-authorization-required', toolName);
    assert.notEqual(result?.reasonCode, 'test-kind-forbidden', toolName);
    assert.notEqual(result?.reasonCode, 'test-execution-forbidden', toolName);
  }

  const browser = await routedRuntime(prompt);
  const browserCall = await event(browser.pi, 'tool_call')({
    toolName: 'omp_test_browser_check',
    input: { baseUrl: 'http://127.0.0.1:3000', scenarios: [] },
  }, browser.ctx);
  assert.equal(browserCall?.reasonCode, 'test-kind-authorization-required');

  const e2e = await routedRuntime('Run end-to-end tests only, but do not run unit tests.');
  const allowedBrowser = await event(e2e.pi, 'tool_call')({
    toolName: 'omp_test_browser_check',
    input: { baseUrl: 'http://127.0.0.1:3000', scenarios: [] },
  }, e2e.ctx);
  assert.notEqual(allowedBrowser?.reasonCode, 'test-kind-authorization-required');
  assert.notEqual(allowedBrowser?.reasonCode, 'test-kind-forbidden');
});

test('explicit no-write routes fail closed for repository-controlled tests and builds', async () => {
  for (const command of ['npm test', 'npm run build', 'make test', './test.sh']) {
    const restricted = await routedRuntime('Run the project checks, but do not modify files.');
    const blocked = await event(restricted.pi, 'tool_call')({ toolName: 'bash', input: { command } }, restricted.ctx);
    assert.equal(blocked?.reasonCode, 'workspace-effects-unverifiable', command);
  }

  const normal = await routedRuntime('Run npm test and report the result.');
  const allowed = await event(normal.pi, 'tool_call')({ toolName: 'bash', input: { command: 'npm test' } }, normal.ctx);
  assert.notEqual(allowed?.reasonCode, 'workspace-effects-unverifiable');
});

test('scoped workspace write authorization blocks excluded and unmentioned files without freezing the allowed target', async () => {
  const prompt = 'Fix src/router.js, but do not modify package-lock.json.';
  const allowed = await routedRuntime(prompt);
  const allowedEdit = await event(allowed.pi, 'tool_call')({
    toolName: 'edit', input: { path: 'src/router.js' },
  }, allowed.ctx);
  assert.notEqual(allowedEdit?.reasonCode, 'workspace-target-excluded');
  assert.notEqual(allowedEdit?.reasonCode, 'workspace-target-authorization-required');

  const excluded = await routedRuntime(prompt);
  const excludedEdit = await event(excluded.pi, 'tool_call')({
    toolName: 'edit', input: { path: 'package-lock.json' },
  }, excluded.ctx);
  assert.equal(excludedEdit?.reasonCode, 'workspace-target-excluded');

  const broadened = await routedRuntime(prompt);
  const broadenedEdit = await event(broadened.pi, 'tool_call')({
    toolName: 'edit', input: { path: 'package.json' },
  }, broadened.ctx);
  assert.equal(broadenedEdit?.reasonCode, 'workspace-target-authorization-required');

  if (process.platform !== 'win32') {
    const wrongCase = await routedRuntime('Fix src/router.js and do not modify any other files.');
    const wrongCaseEdit = await event(wrongCase.pi, 'tool_call')({
      toolName: 'edit', input: { path: 'SRC/ROUTER.js' },
    }, wrongCase.ctx);
    assert.equal(wrongCaseEdit?.reasonCode, 'workspace-target-authorization-required');
  }

  for (const tool of [
    { toolName: 'edit', input: { path: 'src/router.js/../secret.js' } },
    { toolName: 'apply_patch', input: { patch: '*** Begin Patch\n*** Update File: src/router.js/../secret.js\n@@\n-old\n+new\n*** End Patch' } },
  ]) {
    const traversal = await routedRuntime('Fix src/router.js and do not modify any other files.');
    const blockedTraversal = await event(traversal.pi, 'tool_call')(tool, traversal.ctx);
    assert.equal(blockedTraversal?.reasonCode, 'workspace-target-authorization-required');
  }

  const multiFilePatch = await routedRuntime('Fix src/router.js and do not modify any other files.');
  const blockedPatch = await event(multiFilePatch.pi, 'tool_call')({
    toolName: 'apply_patch',
    input: {
      patch: [
        '*** Begin Patch',
        '*** Update File: src/router.js',
        '@@',
        '-old',
        '+new',
        '*** Update File: LICENSE',
        '@@',
        '-old',
        '+new',
        '*** End Patch',
      ].join('\n'),
    },
  }, multiFilePatch.ctx);
  assert.equal(blockedPatch?.reasonCode, 'workspace-target-authorization-required');

  const movedPatch = await routedRuntime('Fix src/router.js and do not modify any other files.');
  const blockedMove = await event(movedPatch.pi, 'tool_call')({
    toolName: 'apply_patch',
    input: {
      patch: [
        '*** Begin Patch',
        '*** Update File: src/router.js',
        '*** Move to: LICENSE',
        '@@',
        '-old',
        '+new',
        '*** End Patch',
      ].join('\n'),
    },
  }, movedPatch.ctx);
  assert.equal(blockedMove?.reasonCode, 'workspace-target-authorization-required');

  const anchored = await routedRuntime(
    'Fix src/router.js and do not modify any other files.',
    { cwd: CORE_PLUGIN_ROOT },
  );
  anchored.pi.entries.push({
    type: 'message',
    message: {
      role: 'toolResult',
      toolName: 'read',
      content: [{ type: 'text', text: '[router.js#ABCD]\n1:export function route(value) {' }],
      details: { meta: { source: { type: 'path', value: join(CORE_PLUGIN_ROOT, 'src/router.js') } } },
    },
  });
  const anchoredEdit = await event(anchored.pi, 'tool_call')({
    toolName: 'edit',
    input: { input: '[router.js#ABCD]\nSWAP 1.=1:\n+export function route(value) {' },
  }, anchored.ctx);
  assert.notEqual(anchoredEdit?.reasonCode, 'workspace-target-authorization-required');

  const forged = await routedRuntime('Fix src/router.js and do not modify any other files.');
  const forgedEdit = await event(forged.pi, 'tool_call')({
    toolName: 'edit',
    input: { input: '[router.js#FFFF]\nSWAP 1.=1:\n+export function route(value) {' },
  }, forged.ctx);
  assert.equal(forgedEdit?.reasonCode, 'workspace-target-authorization-required');

  const mixed = await routedRuntime('Fix src/router.js and do not modify any other files.');
  mixed.pi.entries.push(anchored.pi.entries.find((entry) => entry.type === 'message'));
  const mixedEdit = await event(mixed.pi, 'tool_call')({
    toolName: 'edit',
    input: { input: '[router.js#ABCD]\nSWAP 1.=1:\n+ok\n[LICENSE#FFFF]\nSWAP 1.=1:\n+not allowed' },
  }, mixed.ctx);
  assert.equal(mixedEdit?.reasonCode, 'workspace-target-authorization-required');

  const ambiguous = await routedRuntime('Fix src/router.js and do not modify any other files.');
  for (const value of ['src/router.js', 'test/router.test.js']) {
    ambiguous.pi.entries.push({
      type: 'message',
      message: {
        role: 'toolResult',
        toolName: 'read',
        content: [{ type: 'text', text: '[shared.js#D00D]\n1:same anchor' }],
        details: { meta: { source: { type: 'path', value: join(process.cwd(), value) } } },
      },
    });
  }
  const ambiguousEdit = await event(ambiguous.pi, 'tool_call')({
    toolName: 'edit',
    input: { input: '[shared.js#D00D]\nSWAP 1.=1:\n+ambiguous' },
  }, ambiguous.ctx);
  assert.equal(ambiguousEdit?.reasonCode, 'workspace-target-authorization-required');
});

test('Fix only binds one exact workspace target through the lifecycle boundary', async () => {
  const prompt = 'Fix only src/parser.js so parseCsv trims whitespace around every comma-separated item. Do not modify any other file. Do not run tests. Do not use subagents. Do not access the network. Read src/parser.js, make one focused edit, read back src/parser.js, and report concisely.';

  const denied = await routedRuntime(prompt);
  assert.deepEqual(
    latestCoreState(denied.pi).lastRoute.taskDescriptor.workspaceWriteTargets,
    ['src/parser.js'],
  );
  const deniedEdit = await event(denied.pi, 'tool_call')({
    toolName: 'edit', input: { path: 'other.js' },
  }, denied.ctx);
  assert.equal(deniedEdit?.block, true);
  assert.equal(deniedEdit?.reasonCode, 'workspace-target-authorization-required');

  const allowed = await routedRuntime(prompt);
  const allowedEdit = await event(allowed.pi, 'tool_call')({
    toolName: 'edit', input: { path: 'src/parser.js' },
  }, allowed.ctx);
  assert.notEqual(allowedEdit?.block, true);
  assert.notEqual(allowedEdit?.reasonCode, 'workspace-target-authorization-required');
});

test('primary direct test authoring permits only directly attributable test artifacts', async () => {
  const prompt = 'Add exactly one regression test for routeNaturalLanguageTask; do not modify production code.';
  const readyRuntime = async () => {
    const runtime = await routedRuntime(prompt);
    for (const skill of ['test-driven-development', 'verification-before-completion']) {
      await event(runtime.pi, 'tool_result')({
        name: 'read',
        params: { uri: `skill://${skill}` },
        content: [{ type: 'text', text: `Loaded ${skill}` }],
      }, runtime.ctx);
    }
    return runtime;
  };

  for (const tool of [
    { toolName: 'edit', input: { path: 'test/router.test.js' } },
    { toolName: 'write', input: { path: 'tests/router.spec.ts', content: 'test' } },
    { toolName: 'edit', input: { path: 'src/__tests__/router.ts' } },
  ]) {
    const allowed = await readyRuntime();
    const result = await event(allowed.pi, 'tool_call')(tool, allowed.ctx);
    assert.notEqual(result?.block, true, JSON.stringify(tool));
    assert.notEqual(result?.reasonCode, 'workspace-test-artifact-authorization-required', JSON.stringify(tool));
  }

  for (const tool of [
    { toolName: 'edit', input: { path: 'src/router.js' } },
    { toolName: 'write', input: { content: 'unscoped write' } },
    { toolName: 'bash', input: { command: 'node scripts/rewrite-tests.js' } },
    {
      toolName: 'apply_patch',
      input: {
        patch: [
          '*** Begin Patch',
          '*** Update File: test/router.test.js',
          '@@',
          '-old',
          '+new',
          '*** Update File: src/router.js',
          '@@',
          '-old',
          '+new',
          '*** End Patch',
        ].join('\n'),
      },
    },
  ]) {
    const denied = await readyRuntime();
    const result = await event(denied.pi, 'tool_call')(tool, denied.ctx);
    assert.equal(result?.block, true, JSON.stringify(tool));
    assert.equal(result?.reasonCode, 'workspace-test-artifact-authorization-required', JSON.stringify(tool));
  }

  const repaired = await readyRuntime();
  const deniedProductionEdit = await event(repaired.pi, 'tool_call')({
    toolName: 'edit', input: { path: 'src/router.js' },
  }, repaired.ctx);
  assert.equal(deniedProductionEdit?.reasonCode, 'workspace-test-artifact-authorization-required');
  const allowedTestEdit = await event(repaired.pi, 'tool_call')({
    toolName: 'edit', input: { path: 'test/router.test.js' },
  }, repaired.ctx);
  assert.notEqual(allowedTestEdit?.block, true);
});

test('direct and read-bound edits reject symlink targets outside the workspace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'omp-anchor-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'omp-anchor-outside-'));
  t.after(async () => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await mkdir(join(root, 'src'), { recursive: true });
  const outsideFile = join(outside, 'router.js');
  await writeFile(outsideFile, 'export const route = value => value;\n');
  await symlink(outsideFile, join(root, 'src/router.js'));

  const nestedMissing = await routedRuntime('Fix nested/missing/new.js and do not modify any other files.', { cwd: root });
  const allowedNestedMissing = await event(nestedMissing.pi, 'tool_call')({
    toolName: 'edit',
    input: { path: 'nested/missing/new.js' },
  }, nestedMissing.ctx);
  assert.notEqual(allowedNestedMissing?.reasonCode, 'workspace-target-authorization-required');

  const direct = await routedRuntime('Fix src/router.js and do not modify any other files.', { cwd: root });
  const blockedDirect = await event(direct.pi, 'tool_call')({
    toolName: 'edit',
    input: { path: 'src/router.js' },
  }, direct.ctx);
  assert.equal(blockedDirect?.reasonCode, 'workspace-target-authorization-required');

  const unscoped = await routedRuntime('Fix the parser bug.', { cwd: root });
  assert.deepEqual(latestCoreState(unscoped.pi).lastRoute.taskDescriptor.workspaceWriteTargets, []);
  const blockedUnscoped = await event(unscoped.pi, 'tool_call')({
    toolName: 'edit',
    input: { path: 'src/router.js' },
  }, unscoped.ctx);
  assert.equal(blockedUnscoped?.reasonCode, 'workspace-target-authorization-required');

  const runtime = await routedRuntime('Fix src/router.js and do not modify any other files.', { cwd: root });
  runtime.pi.entries.push({
    type: 'message',
    message: {
      role: 'toolResult',
      toolName: 'read',
      content: [{ type: 'text', text: '[router.js#BEEF]\n1:export const route = value => value;' }],
      details: { meta: { source: { type: 'path', value: join(root, 'src/router.js') } } },
    },
  });
  const blocked = await event(runtime.pi, 'tool_call')({
    toolName: 'edit',
    input: { input: '[src/router.js#BEEF]\nSWAP 1.=1:\n+export const route = value => value.trim();' },
  }, runtime.ctx);
  assert.equal(blocked?.reasonCode, 'workspace-target-authorization-required');

  const recovered = await routedRuntime('Fix src/router.js and do not modify any other files.', { cwd: root });
  recovered.pi.entries.push(runtime.pi.entries.find((entry) => entry.type === 'message'));
  const blockedRecovery = await event(recovered.pi, 'tool_call')({
    toolName: 'edit',
    input: { input: '[missing/router.js#BEEF]\nSWAP 1.=1:\n+export const route = value => value.trim();' },
  }, recovered.ctx);
  assert.equal(blockedRecovery?.reasonCode, 'workspace-target-authorization-required');
});

test('RPIV edit anchors mirror host path selection and trusted read identity', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'omp-anchor-root-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(root, 'docs'), { recursive: true }),
    mkdir(join(root, 'src'), { recursive: true }),
    mkdir(join(root, 'test'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, 'docs/notes.md'), '# Notes\n'),
    writeFile(join(root, 'docs/Notes.md'), '# Case-sensitive Notes\n'),
    writeFile(join(root, 'docs/other.md'), '# Other\n'),
    writeFile(join(root, 'src/router.js'), 'export const source = true;\n'),
    writeFile(join(root, 'test/router.js'), 'export const test = true;\n'),
    writeFile(join(root, 'router.js'), 'export const basenameShadow = true;\n'),
    ...(process.platform === 'win32' ? [] : [
      writeFile(join(root, 'docs\\notes.md'), '# Literal backslash\n'),
    ]),
  ]);

  const addReadResult = (runtime, {
    target,
    renderedAnchor,
    resolvedPath = target === undefined ? undefined : join(root, target),
    metaSource,
  }) => {
    const details = { displayContent: { text: '# Notes\n', startLine: 1 } };
    if (resolvedPath !== undefined) details.resolvedPath = resolvedPath;
    if (metaSource !== undefined) details.meta = { source: metaSource };
    runtime.pi.entries.push({
      type: 'message',
      message: {
        role: 'toolResult',
        toolName: 'read',
        content: [{ type: 'text', text: `${renderedAnchor}\n1:# Notes` }],
        details,
        isError: false,
      },
    });
  };
  const callRpivEdit = (runtime, anchor) => event(runtime.pi, 'tool_call')({
    toolName: 'edit',
    input: { input: `${anchor}\nSWAP 1.=1:\n+# Polished notes` },
  }, runtime.ctx);

  await t.test('an existing declared path must be the same real file as every read identity field', async () => {
    const runtime = await routedRuntime('Polish docs/notes.md and do not modify any other files.', { cwd: root });
    addReadResult(runtime, {
      target: 'docs/notes.md',
      renderedAnchor: '[notes.md#842A]',
      metaSource: { type: 'path', value: join(root, 'docs/notes.md') },
    });
    const allowed = await callRpivEdit(runtime, '[docs/notes.md#842A]');
    assert.notEqual(allowed?.reasonCode, 'workspace-target-authorization-required');
  });

  await t.test('a missing declared path may recover through one same-basename tag source', async () => {
    const runtime = await routedRuntime('Polish docs/notes.md and do not modify any other files.', { cwd: root });
    addReadResult(runtime, {
      target: undefined,
      renderedAnchor: '[notes.md#A11E]',
      metaSource: { type: 'path', value: join(root, 'docs/notes.md') },
    });
    addReadResult(runtime, { target: 'docs/other.md', renderedAnchor: '[other.md#A11E]' });
    const allowed = await callRpivEdit(runtime, '[missing/notes.md#A11E]');
    assert.notEqual(allowed?.reasonCode, 'workspace-target-authorization-required');
  });

  await t.test('an existing basename shadow wins over tag recovery', async () => {
    const runtime = await routedRuntime('Fix src/router.js and do not modify any other files.', { cwd: root });
    addReadResult(runtime, { target: 'src/router.js', renderedAnchor: '[router.js#BA5E]' });
    const blocked = await callRpivEdit(runtime, '[router.js#BA5E]');
    assert.equal(blocked?.reasonCode, 'workspace-target-authorization-required');
  });

  await t.test('POSIX path case is preserved and case twins are not interchangeable', {
    skip: process.platform === 'win32',
  }, async () => {
    const exact = await routedRuntime('Polish docs/Notes.md and do not modify any other files.', { cwd: root });
    addReadResult(exact, { target: 'docs/Notes.md', renderedAnchor: '[Notes.md#CA5E]' });
    assert.notEqual((await callRpivEdit(exact, '[docs/Notes.md#CA5E]'))?.reasonCode,
      'workspace-target-authorization-required');

    const twin = await routedRuntime('Polish docs/Notes.md and do not modify any other files.', { cwd: root });
    addReadResult(twin, { target: 'docs/notes.md', renderedAnchor: '[notes.md#CA5F]' });
    assert.equal((await callRpivEdit(twin, '[docs/Notes.md#CA5F]'))?.reasonCode,
      'workspace-target-authorization-required');
  });

  await t.test('POSIX backslashes remain filename characters rather than separators', {
    skip: process.platform === 'win32',
  }, async () => {
    const exact = await routedRuntime('Polish "docs\\notes.md" and do not modify any other files.', { cwd: root });
    assert.deepEqual(latestCoreState(exact.pi).lastRoute.taskDescriptor.workspaceWriteTargets, ['docs\\notes.md']);
    addReadResult(exact, { target: 'docs\\notes.md', renderedAnchor: '[docs\\notes.md#BACC]' });
    assert.notEqual((await callRpivEdit(exact, '[docs\\notes.md#BACC]'))?.reasonCode,
      'workspace-target-authorization-required');

    const slashTwin = await routedRuntime('Polish "docs\\notes.md" and do not modify any other files.', { cwd: root });
    addReadResult(slashTwin, { target: 'docs/notes.md', renderedAnchor: '[docs/notes.md#BACD]' });
    assert.equal((await callRpivEdit(slashTwin, '[docs\\notes.md#BACD]'))?.reasonCode,
      'workspace-target-authorization-required');
  });

  await t.test('conflicting resolvedPath and meta.source fields are unresolved', async () => {
    const runtime = await routedRuntime('Polish docs/notes.md and do not modify any other files.', { cwd: root });
    addReadResult(runtime, {
      target: 'docs/notes.md',
      renderedAnchor: '[notes.md#C0FF]',
      metaSource: { type: 'path', value: join(root, 'docs/other.md') },
    });
    assert.equal((await callRpivEdit(runtime, '[docs/notes.md#C0FF]'))?.reasonCode,
      'workspace-target-authorization-required');
  });

  await t.test('relative and non-path read identities are unresolved even beside a valid field', async () => {
    const cases = [
      { resolvedPath: 'docs/notes.md' },
      {
        resolvedPath: join(root, 'docs/notes.md'),
        metaSource: { type: 'path', value: 'docs/notes.md' },
      },
      {
        resolvedPath: join(root, 'docs/notes.md'),
        metaSource: { type: 'url', value: join(root, 'docs/notes.md') },
      },
    ];
    for (const [index, identity] of cases.entries()) {
      const runtime = await routedRuntime('Polish docs/notes.md and do not modify any other files.', { cwd: root });
      const tag = `BAD${index}`;
      addReadResult(runtime, { renderedAnchor: `[notes.md#${tag}]`, ...identity });
      assert.equal((await callRpivEdit(runtime, `[docs/notes.md#${tag}]`))?.reasonCode,
        'workspace-target-authorization-required');
    }
  });

  await t.test('one tag observed from multiple read sources is unresolved', async () => {
    const runtime = await routedRuntime('Fix src/router.js and do not modify any other files.', { cwd: root });
    addReadResult(runtime, { target: 'src/router.js', renderedAnchor: '[router.js#D00D]' });
    addReadResult(runtime, { target: 'test/router.js', renderedAnchor: '[router.js#D00D]' });
    assert.equal((await callRpivEdit(runtime, '[missing/router.js#D00D]'))?.reasonCode,
      'workspace-target-authorization-required');
  });

  await t.test('missing, wrong-target, and out-of-scope identities remain unresolved', async () => {
    const missing = await routedRuntime('Polish docs/notes.md and do not modify any other files.', { cwd: root });
    addReadResult(missing, { target: undefined, renderedAnchor: '[notes.md#77CC]' });
    assert.equal((await callRpivEdit(missing, '[docs/notes.md#77CC]'))?.reasonCode,
      'workspace-target-authorization-required');

    const mislabeled = await routedRuntime('Polish docs/notes.md and do not modify any other files.', { cwd: root });
    addReadResult(mislabeled, { target: 'docs/notes.md', renderedAnchor: '[notes.md#55DD]' });
    assert.equal((await callRpivEdit(mislabeled, '[docs/other.md#55DD]'))?.reasonCode,
      'workspace-target-authorization-required');

    const outside = await routedRuntime('Polish docs/notes.md and do not modify any other files.', { cwd: root });
    addReadResult(outside, { target: 'docs/other.md', renderedAnchor: '[other.md#991B]' });
    assert.equal((await callRpivEdit(outside, '[docs/other.md#991B]'))?.reasonCode,
      'workspace-target-authorization-required');
  });
});

test('scoped deployment authorization rejects production while preserving the trusted staging target', async () => {
  const prompt = 'Deploy to staging, but do not deploy to production.';
  const production = await routedRuntime(prompt);
  const blocked = await event(production.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'vercel deploy --target production' },
  }, production.ctx);
  assert.equal(blocked?.reasonCode, 'external-target-excluded');

  const staging = await routedRuntime(prompt);
  const stagingResult = await event(staging.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'vercel deploy --target staging' },
  }, staging.ctx);
  assert.notEqual(stagingResult?.reasonCode, 'external-target-excluded');
  assert.notEqual(stagingResult?.reasonCode, 'external-target-repair-required');
});

test('browser-check payloads cannot hide artifact writes, destructive server commands, or remote interaction', async () => {
  const readOnly = await routedRuntime('Run the browser checks, but do not modify files.');
  const artifactBlocked = await event(readOnly.pi, 'tool_call')({
    toolName: 'omp_test_browser_check',
    input: { baseUrl: 'http://127.0.0.1:3000', scenarios: [] },
  }, readOnly.ctx);
  assert.equal(artifactBlocked?.reasonCode, 'workspace-effects-unverifiable');

  const destructive = await routedRuntime('Fix the browser tests and run them locally.');
  assert.equal(latestCoreState(destructive.pi).lastRoute.taskDescriptor.constraints.testExecution, 'required');
  const destructiveBlocked = await event(destructive.pi, 'tool_call')({
    toolName: 'omp_test_browser_check',
    input: { baseUrl: 'http://127.0.0.1:3000', serverCommand: 'rm -rf cache', scenarios: [] },
  }, destructive.ctx);
  assert.equal(destructiveBlocked?.reasonCode, 'irreversible-approval-required');

  const remote = await routedRuntime('Run the browser tests without changing external services.');
  const remoteBlocked = await event(remote.pi, 'tool_call')({
    toolName: 'omp_test_browser_check',
    input: { baseUrl: 'https://production.example.com', scenarios: [] },
  }, remote.ctx);
  assert.equal(remoteBlocked?.reasonCode, 'external-write-forbidden');
});

test('no-network routes block web and remote shell access', async () => {
  for (const tool of [
    { toolName: 'bash', input: { command: 'curl https://example.com/data' } },
    { toolName: 'web_search', input: { query: 'router security' } },
    { toolName: 'bash', input: { command: 'git fetch origin' } },
    { toolName: 'bash', input: { command: '/usr/bin/curl https://example.com/data' } },
    { toolName: 'bash', input: { command: 'bash -c "curl https://example.com/data"' } },
    { toolName: 'bash', input: { command: 'git -C . fetch origin' } },
    { toolName: 'writing_quality_check', input: { text: 'draft with [1]' } },
    { toolName: 'fact_check_evidence', input: { claims: [], allowNetwork: true } },
  ]) {
    const { pi, ctx } = await routedRuntime('只审查本地代码，不要联网，也不要修改文件。');
    const blocked = await event(pi, 'tool_call')(tool, ctx);
    assert.equal(blocked?.reasonCode, 'network-access-forbidden', JSON.stringify(tool));
  }

  const { pi, ctx } = await routedRuntime('只审查本地代码，不要联网，也不要修改文件。');
  assert.notEqual((await event(pi, 'tool_call')({
    toolName: 'writing_quality_check',
    input: { text: 'local draft', allowNetwork: false },
  }, ctx))?.reasonCode, 'network-access-forbidden');
  assert.notEqual((await event(pi, 'tool_call')({
    toolName: 'fact_check_evidence',
    input: { claims: [], allowNetwork: false },
  }, ctx))?.reasonCode, 'network-access-forbidden');

  const unknown = await routedRuntime('Fix src/router.js locally, but do not use the network.');
  const unverifiable = await event(unknown.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'custom-native-client --inspect local-data' },
  }, unknown.ctx);
  assert.equal(unverifiable?.reasonCode, 'network-access-unverifiable');
});

test('no-network routes also block non-MCP provider reads and generic remote APIs', async () => {
  for (const tool of [
    { toolName: 'github_get_issue', input: { owner: 'org', repo: 'repo', issue_number: 1 } },
    { toolName: 'slack_search_messages', input: { query: 'incident' } },
    { toolName: 'notion_read_page', input: { page_id: 'page' } },
    { toolName: 'aws_describe_instances', input: { region: 'us-east-1' } },
    { toolName: 'database_query', input: { sql: 'SELECT 1' } },
    { toolName: 'mcp__github__api', input: { method: 'GET', path: '/repos/org/repo' } },
  ]) {
    const runtime = await routedRuntime('Inspect src/router.js locally, but do not use the network.');
    const blocked = await event(runtime.pi, 'tool_call')(tool, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'network-access-forbidden', tool.toolName);
  }
});

test('no-subagent routes block nested agent CLIs, not only the task tool', async () => {
  for (const command of ['codex exec "review src"', 'opencode run "review src"']) {
    const { pi, ctx } = await routedRuntime('Fix src/router.js, but do not use subagents; main agent only.');
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.reasonCode, 'subagents-forbidden', command);
  }


  for (const toolName of [
    'collaboration.spawn_agent',
    'collaboration.followup_task',
    'collaboration.send_message',
    'collaboration.wait_agent',
    'collaboration.interrupt_agent',
    'collaboration.list_agents',
  ]) {
    const route = await routedRuntime('Fix src/router.js, but do not use subagents; main agent only.');
    const blocked = await event(route.pi, 'tool_call')({ toolName, input: {} }, route.ctx);
    assert.equal(blocked?.reasonCode, 'subagents-forbidden', toolName);
  }

  const route = await routedRuntime('Fix src/router.js, but do not use subagents; main agent only.');
  for (const toolName of ['functions.request_user_input', 'functions.update_plan']) {
    const allowed = await event(route.pi, 'tool_call')({ toolName, input: {} }, route.ctx);
    assert.notEqual(allowed?.block, true, toolName);
  }
});

test('no-subagent routes block collaboration with existing agents as well as spawning', async () => {
  for (const toolName of [
    'collaboration.spawn_agent',
    'collaboration.followup_task',
    'collaboration.send_message',
    'collaboration.wait_agent',
    'collaboration.interrupt_agent',
    'collaboration.list_agents',
  ]) {
    const runtime = await routedRuntime('Fix src/router.js, but do not use subagents; main agent only.');
    const blocked = await event(runtime.pi, 'tool_call')({ toolName, input: { target: 'reviewer' } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'subagents-forbidden', toolName);
  }
});

test('no-external-write routes block provider and HTTP mutations', async () => {
  for (const command of [
    'aws s3 cp artifact s3://prod-bucket/',
    'docker push org/image:tag',
    'curl -X POST -d data https://example.com/api',
    'gh issue create --title bug',
    'npm dist-tag add pkg@1 latest',
    'git -C . push origin main',
    'gh api --method POST repos/org/repo/issues',
    'omp plugin upgrade omp-enhancer-core',
    "psql postgresql://db/prod -c 'DELETE FROM users'",
    'scp artifact user@host:/srv/app',
    "ssh host 'touch /srv/changed'",
    'redis-cli -h prod FLUSHALL',
    'rsync --delete artifact/ user@host:/srv/app/',
  ]) {
    const { pi, ctx } = await routedRuntime('Fix the parser and test it, but do not push, publish, or deploy.');
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.reasonCode, 'external-write-forbidden', command);
  }

  for (const toolName of [
    'mcp__github__add_issue_comment',
    'mcp__jira__add_comment',
    'mcp__slack__add_reaction',
    'mcp__google_drive__share_file',
    'mcp__calendar__rsvp',
    'mcp__notion__archive_page',
    'mcp__github__set_labels',
  ]) {
    const runtime = await routedRuntime('Fix the parser and test it, but do not push, publish, or deploy.');
    const blocked = await event(runtime.pi, 'tool_call')({ toolName, input: { target: 'other' } }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'external-write-forbidden', toolName);
  }
});

test('connector implementation meta-work cannot mint authority for a real provider mutation', async () => {
  for (const { prompt, toolName, input } of [
    {
      prompt: 'Implement send email support in mailer.js.',
      toolName: 'gmail_send_email',
      input: { to: 'alice@example.com', body: 'test' },
    },
    {
      prompt: 'Fix sending email to alice@example.com in src/mailer.js.',
      toolName: 'gmail_send_email',
      input: { to: 'alice@example.com', body: 'test' },
    },
    {
      prompt: 'Add Google Drive upload support to drive.ts.',
      toolName: 'google_drive_upload_file',
      input: { folderId: 'F1', file: 'report.pdf' },
    },
    {
      prompt: 'Implement update Notion page logic in notion.ts.',
      toolName: 'notion_update_page',
      input: { pageId: 'roadmap' },
    },
    {
      prompt: 'Implement create Jira issue support in jira.ts.',
      toolName: 'jira_create_issue',
      input: { projectKey: 'CORE' },
    },
    {
      prompt: 'Create an event handler in src/app.js.',
      toolName: 'google_calendar_create_event',
      input: { calendarId: 'primary' },
    },
  ]) {
    const { pi, ctx } = await routedRuntime(prompt);
    const blocked = await event(pi, 'tool_call')({ toolName, input }, ctx);
    assert.equal(blocked?.reasonCode, 'external-write-forbidden', prompt);
  }
});

test('no-external-write routes block generic remote mutations and unknown generic operations', async () => {
  const tools = [
    { toolName: 'mcp__github__api', input: { method: 'POST', path: '/repos/org/repo/issues' } },
    { toolName: 'mcp__github__graphql', input: { query: 'mutation { createIssue(input: {}) { id } }' } },
    { toolName: 'mcp__slack__api_call', input: { operation: 'chat.postMessage', channel: 'C1' } },
    { toolName: 'mcp__notion__request', input: { method: 'PATCH', path: '/pages/p1' } },
    { toolName: 'mcp__github__api', input: { operation: 'customUnknownOperation' } },
  ];
  for (const tool of tools) {
    const runtime = await routedRuntime('Fix src/router.js, but do not push, publish, deploy, or write to external services.');
    const blocked = await event(runtime.pi, 'tool_call')(tool, runtime.ctx);
    assert.equal(blocked?.block, true, tool.toolName);
    assert.ok(['external-write-forbidden', 'external-effects-unverifiable'].includes(blocked?.reasonCode), `${tool.toolName}: ${blocked?.reasonCode}`);
  }
});

test('reversible connector actions are bound to the exact provider action and target without becoming releases', async () => {
  const cases = [
    {
      prompt: 'Send an email to alice@example.com.',
      good: { toolName: 'gmail.send_email', input: { to: 'alice@example.com', body: 'Status update' } },
      wrong: { toolName: 'gmail.send_email', input: { to: 'bob@example.com', body: 'Status update' } },
    },
    {
      prompt: 'Post a Slack message to channel #C1.',
      good: { toolName: 'mcp__slack__api_call', input: { operation: 'chat.postMessage', channel: 'C1', text: 'Status update' } },
      wrong: { toolName: 'mcp__slack__api_call', input: { operation: 'chat.postMessage', channel: 'C2', text: 'Status update' } },
    },
    {
      prompt: 'Update Notion page roadmap.',
      good: { toolName: 'mcp__notion__request', input: { method: 'PATCH', path: '/v1/pages/roadmap', body: { title: 'Roadmap' } } },
      wrong: { toolName: 'mcp__notion__request', input: { method: 'PATCH', path: '/v1/pages/other', body: { title: 'Roadmap' } } },
    },
  ];

  for (const { prompt, good, wrong } of cases) {
    const exact = await routedRuntime(prompt);
    const allowed = await event(exact.pi, 'tool_call')(good, exact.ctx);
    assert.notEqual(allowed?.block, true, `${prompt}: ${allowed?.reason ?? 'blocked'}`);
    await event(exact.pi, 'tool_result')({ ...good, status: 'success', isError: false }, exact.ctx);
    assert.equal(await event(exact.pi, 'session_stop')({ output: 'The requested connector action completed.' }, exact.ctx), undefined);

    const mismatch = await routedRuntime(prompt);
    const repair = await event(mismatch.pi, 'tool_call')(wrong, mismatch.ctx);
    assert.equal(repair?.reasonCode, 'external-action-repair-required', prompt);
    assert.match(repair.reason, /exact target|Correct the call once/i);
    const corrected = await event(mismatch.pi, 'tool_call')(good, mismatch.ctx);
    assert.notEqual(corrected?.block, true, `${prompt}: exact repair should be allowed`);
  }
});

test('a connector contract cannot authorize a different provider or an unrelated release mutation', async () => {
  for (const tool of [
    { toolName: 'slack.post_message', input: { channel: 'alice@example.com', text: 'wrong provider' } },
    { toolName: 'bash', input: { command: 'git push origin main' } },
  ]) {
    const runtime = await routedRuntime('Send an email to alice@example.com.');
    const blocked = await event(runtime.pi, 'tool_call')(tool, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'external-action-repair-required', tool.toolName);
  }
});

test('connector how-to advice cannot authorize the described external mutation', async () => {
  const runtime = await routedRuntime('Tell me how to upload a file to Google Drive folder F1.');
  const blocked = await event(runtime.pi, 'tool_call')({
    toolName: 'google_drive.upload_file', input: { folderId: 'F1', file: 'report.pdf' },
  }, runtime.ctx);
  assert.equal(blocked?.reasonCode, 'external-write-forbidden');
});

test('incomplete, conflicting, and multi-action connector requests pause once instead of probing targets', async () => {
  const cases = [
    'Send an email.',
    'Send email to alice@example.com and bob@example.com.',
    'Send email to alice@example.com and post a Slack message to #C1.',
  ];
  for (const prompt of cases) {
    const runtime = await routedRuntime(prompt);
    const blocked = await event(runtime.pi, 'tool_call')({
      toolName: 'gmail.send_email', input: { to: 'alice@example.com', body: 'Status update' },
    }, runtime.ctx);
    assert.equal(blocked?.reasonCode, 'external-action-target-confirmation-required', prompt);
    assert.match(blocked.reason, /ask once|split or sequence|conflicting targets/i, prompt);
    assert.equal(
      await event(runtime.pi, 'session_stop')({ output: 'Please provide one exact connector target.' }, runtime.ctx),
      undefined,
      prompt,
    );
  }
});

test('irreversible routes block destructive command variants without trusted approval', async () => {
  for (const command of [
    'find cache -type f -delete',
    'git clean -fdx',
    'truncate -s 0 data.db',
    'shred -u secret.txt',
    'python -c "import shutil; shutil.rmtree(\'cache\')"',
    'node -e "require(\'fs\').rmSync(\'cache\', {recursive:true})"',
    '/bin/rm -rf cache',
    'git checkout -- src/router.js',
    'python -c "import os; os.remove(\'cache.tmp\')"',
  ]) {
    const { pi, ctx } = await routedRuntime('Remove all files in the cache directory.');
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.reasonCode, 'irreversible-approval-required', command);
  }
});

test('destructive external requests fail explicitly when no safe provider verification contract exists', async () => {
  const { pi, ctx } = await routedRuntime('Delete GitHub issue 123.');
  const blocked = await event(pi, 'tool_call')({
    toolName: 'mcp__github__delete_issue', input: { owner: 'org', repo: 'repo', issue_number: 123 },
  }, ctx);
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.reasonCode, 'external-destructive-action-unsupported');
  assert.match(blocked.reason, /intentionally unsupported|provider-native/i);
  assert.equal(await event(pi, 'session_stop')({ output: 'This destructive provider action is not safely supported.' }, ctx), undefined);
});

test('failed core registration does not leave a false live gate-owner lease', () => {
  const events = {};
  const pi = new FakePi();
  pi.events = events;
  pi.registerTool = () => { throw new Error('synthetic registration failure'); };

  assert.throws(() => registerCoreEnhancer(pi), /synthetic registration failure/);
  assert.equal(Reflect.get(events, Symbol.for('omp-enhancer.core.gate-owner')), undefined);
});

test('two protected-action denials terminalize globally instead of allowing cross-method shopping', async () => {
  const prompt = '只审查本地代码，不要联网，不要运行测试，也不要修改文件。';
  const repeated = await routedRuntime(prompt);
  const first = await event(repeated.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'curl https://example.com' },
  }, repeated.ctx);
  const second = await event(repeated.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'git fetch origin' },
  }, repeated.ctx);
  const terminalSafeCall = await event(repeated.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'git status --short' },
  }, repeated.ctx);
  assert.equal(first?.reasonCode, 'network-access-forbidden');
  assert.equal(second?.reasonCode, 'protected-action-terminal');
  assert.equal(terminalSafeCall?.block, true);
  assert.match(terminalSafeCall.reason, /OMP_GATE_TERMINAL/);
  const terminalStop = await event(repeated.pi, 'session_stop')({ output: 'Done.' }, repeated.ctx);
  assert.equal(terminalStop?.continue, true);
  assert.match(terminalStop?.additionalContext ?? '', /^OMP_GATE_TERMINAL/);
  assert.equal(latestCoreState(repeated.pi).gateController.phase, 'blocked');
  assert.ok(latestCoreState(repeated.pi).gateController.openGates['action-boundary']);

  const distinct = await routedRuntime(prompt);
  assert.equal((await event(distinct.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'curl https://example.com' },
  }, distinct.ctx))?.reasonCode, 'network-access-forbidden');
  assert.equal((await event(distinct.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'npm test' },
  }, distinct.ctx))?.reasonCode, 'protected-action-terminal');
  const distinctSafeCall = await event(distinct.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'git status --short' },
  }, distinct.ctx);
  assert.equal(distinctSafeCall?.block, true);
  assert.match(distinctSafeCall.reason, /OMP_GATE_TERMINAL/);

  await event(repeated.pi, 'before_agent_start')({ prompt }, repeated.ctx);
  assert.notEqual((await event(repeated.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'git status --short' },
  }, repeated.ctx))?.block, true);
});

test('persisted action-boundary counters are clamped and fail closed', async () => {
  const runtime = await routedRuntime('只审查本地代码，不要联网，也不要修改文件。');
  const snapshot = runtime.pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state');
  snapshot.data.actionBoundary = {
    schemaVersion: 1,
    denialCount: 999,
    terminal: false,
    fingerprints: ['not-a-digest'],
    reasonCounts: { 'network-access-forbidden': 999 },
  };
  const blocked = await event(runtime.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'git status --short' },
  }, runtime.ctx);
  assert.equal(blocked?.block, true);
  assert.match(blocked.reason, /OMP_GATE_TERMINAL/);
});

test('no-subagent exact-test routes allow the observational core status tool', async () => {
  const runtime = await routedRuntime('Run exactly node --test test/parser.test.js. Do not edit files, use subagents, or publish.');
  const statusCall = await event(runtime.pi, 'tool_call')({
    toolName: 'omp_core_subagent_status', input: {},
  }, runtime.ctx);
  assert.notEqual(statusCall?.block, true, statusCall?.reason);

  await event(runtime.pi, 'tool_result')({
    type: 'tool_result',
    toolCallId: 'exact-test-status-evidence',
    toolName: 'bash',
    input: { command: 'node --test test/parser.test.js' },
    output: 'ℹ tests 1\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0',
    isError: false,
  }, runtime.ctx);
  const status = await runtime.pi.tools.get('omp_core_subagent_status').execute(
    'exact-test-status', {}, undefined, undefined, runtime.ctx,
  );
  assert.deepEqual(status.details.status.required_tools, []);
  assert.deepEqual(status.details.status.gate_requirements, [{ key: 'test-evidence', mode: 'required' }]);
  assert.equal(status.details.status.testing_gate_satisfied, true);
  assert.match(status.content[0].text, /Testing gate satisfied:\s*true/i);
});

function latestCoreState(pi) {
  return pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
}

async function routedRuntime(prompt, options = {}) {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = {
    sessionManager: { getBranch: () => pi.entries },
    ui: { notify: () => undefined },
    hasUI: false,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  };
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  return { pi, ctx };
}

function event(pi, name) {
  const found = pi.handlers.find((item) => item.name === name);
  assert.ok(found, `missing ${name} handler`);
  return found.handler;
}

class FakePi {
  constructor() {
    this.entries = [];
    this.handlers = [];
    this.tools = new Map();
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel() {}
  registerTool(tool) { this.tools.set(tool.name, tool); }
  on(name, handler) { this.handlers.push({ name, handler }); }
  appendEntry(customType, data) { this.entries.push({ type: 'custom', customType, data }); }
}

function fakeZod() {
  const optional = (schema) => ({ ...schema, optional: () => ({ type: 'optional', schema }) });
  return {
    object: (shape) => optional({ type: 'object', shape }),
    string: () => optional({ type: 'string' }),
    boolean: () => optional({ type: 'boolean' }),
    array: (schema) => optional({ type: 'array', schema }),
    enum: (values) => optional({ type: 'enum', values }),
    optional: (schema) => ({ type: 'optional', schema }),
  };
}
