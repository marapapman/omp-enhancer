import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import registerCoreEnhancer from '../index.js';

const RELEASE_SHA_BEFORE = '0123456789abcdef0123456789abcdef01234567';
const RELEASE_SHA_AFTER = '89abcdef0123456789abcdef0123456789abcdef';
const RELEASE_REMOTE = 'https://github.com/org/repo.git';
const RELEASE_AUTH_PROMPT = `Push commit ${RELEASE_SHA_AFTER} to ${RELEASE_REMOTE} at refs/heads/main.`;

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
  assert.equal(await event(pi, 'session_stop')({ output: 'Please rerun with interactive write approval enabled.' }, ctx), undefined);
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
  assert.equal(await event(pi, 'session_stop')({ output: 'Please confirm the exact repository, revision, and ref.' }, ctx), undefined);
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
  assert.equal(await event(pi, 'session_stop')({ output: 'The release command needs an explicit verifiable target.' }, ctx), undefined);
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
  for (const continuation of ['继续', '开始吧', '按计划执行', '照这个方案做', 'Proceed with the plan', 'Go ahead', 'Continue']) {
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
});

test('no-test routes block common runners but allow lint-only checks', async () => {
  for (const command of [
    'node --test', 'make test', 'ctest', 'npm run unit', 'pnpm run check:test', './test.sh',
    'npx jest', 'pnpm exec vitest run', 'python -m pytest', './gradlew test',
    'tox', 'bundle exec rspec', 'playwright test',
  ]) {
    const { pi, ctx } = await routedRuntime('Fix the parser but do not run tests.');
    const blocked = await event(pi, 'tool_call')({ toolName: 'bash', input: { command } }, ctx);
    assert.equal(blocked?.reasonCode, 'test-execution-forbidden', command);
  }
  const { pi, ctx } = await routedRuntime('Fix the parser but do not run tests.');
  assert.notEqual((await event(pi, 'tool_call')({ toolName: 'bash', input: { command: 'npm run lint' } }, ctx))?.block, true);
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

  for (const command of ['npm test', 'npm run test:integration', 'npm run test:smoke']) {
    const disallowed = await routedRuntime(prompt);
    const blocked = await event(disallowed.pi, 'tool_call')({ toolName: 'bash', input: { command } }, disallowed.ctx);
    assert.equal(blocked?.reasonCode, 'test-kind-authorization-required', command);
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

test('repeated protected-action denials terminalize per constraint while distinct reasons do not', async () => {
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

  const distinct = await routedRuntime(prompt);
  assert.equal((await event(distinct.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'curl https://example.com' },
  }, distinct.ctx))?.reasonCode, 'network-access-forbidden');
  assert.equal((await event(distinct.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'npm test' },
  }, distinct.ctx))?.reasonCode, 'test-execution-forbidden');
  assert.notEqual((await event(distinct.pi, 'tool_call')({
    toolName: 'bash', input: { command: 'git status --short' },
  }, distinct.ctx))?.block, true);

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
