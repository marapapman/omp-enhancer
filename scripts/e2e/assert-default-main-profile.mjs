#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareWorktreeIsolation } from './run-installed-deepseek-workflow.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RPC_PROBE = path.join(SCRIPT_DIR, 'omp17-rpc-probe.mjs');
const OMP_ARGS = ['--no-extensions', '--no-tools'];

for (const name of ['--model', '--thinking']) {
  assert.equal(
    OMP_ARGS.some((argument) => argument === name || argument.startsWith(`${name}=`)),
    false,
    `Default-profile probe must not pass ${name}.`,
  );
}

let isolation;
try {
  // OMP resolves provider-backed model selectors from agent.db even before a
  // request is sent. Snapshot it so this probe exercises the packaged selector
  // instead of OMP's credential-free fallback; the probe never invokes a model,
  // so no provider request or OAuth refresh can occur.
  isolation = await prepareWorktreeIsolation({
    dryRun: false,
    relevantOauthProviders: [],
  });
  const isolatedConfig = await readFile(path.join(isolation.agentDir, 'config.yml'), 'utf8');
  assert.match(
    isolatedConfig,
    /^\s{2}default:\s+opencode-go\/deepseek-v4-flash:max$/mu,
    'Isolated OMP startup config did not contain the packaged Main default.',
  );

  const probe = spawnSync(process.execPath, [RPC_PROBE, '--', ...OMP_ARGS], {
    cwd: isolation.stateRoot,
    env: {
      ...isolation.env,
      OMP_RPC_CWD: isolation.stateRoot,
      OMP_RPC_SETUP_COMMAND: '',
      OMP_RPC_STATE_ROOT: isolation.stateRoot,
      OMP_RPC_USE_HOST_INSTALLATION: '0',
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });

  if (probe.error) throw probe.error;
  assert.equal(probe.signal, null, `OMP RPC startup probe exited by signal ${probe.signal}.`);
  assert.equal(
    probe.status,
    0,
    `OMP RPC startup probe failed.\n${String(probe.stderr ?? '').trim()}`,
  );

  let state;
  try {
    state = JSON.parse(probe.stdout);
  } catch (error) {
    throw new Error(
      `OMP RPC startup probe returned invalid JSON: ${String(probe.stdout ?? '').slice(0, 500)}`,
      { cause: error },
    );
  }

  assert.equal(state.model?.provider, 'opencode-go');
  assert.equal(state.model?.id, 'deepseek-v4-flash');
  assert.equal(state.thinkingLevel, 'max');
  assert.equal(state.hostInstallation, false, 'Startup probe must use the isolated OMP state.');
  assert.equal(state.setupAgentInvoked, null, 'Startup probe must not send a model prompt.');

  process.stdout.write(`${JSON.stringify({
    ok: true,
    model: state.model,
    thinkingLevel: state.thinkingLevel,
    setupAgentInvoked: state.setupAgentInvoked,
  }, null, 2)}\n`);
} finally {
  const stateRoot = isolation?.stateRoot;
  await isolation?.cleanup();
  if (stateRoot) await assert.rejects(access(stateRoot), { code: 'ENOENT' });
}
