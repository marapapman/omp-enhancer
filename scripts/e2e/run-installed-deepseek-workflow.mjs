#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateWorkflowSummary,
  mergeCustomEventFallbacks,
  parseNdjson,
  summarizeWorkflowEvents,
} from './workflow-events.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_MATRIX = path.join(SCRIPT_DIR, 'fixtures', 'deepseek-installed-matrix.json');

export async function runInstalledMatrix(options = {}) {
  const matrixPath = path.resolve(options.matrixPath ?? DEFAULT_MATRIX);
  const matrix = JSON.parse(await readFile(matrixPath, 'utf8'));
  const selected = new Set(options.scenarioIds ?? []);
  const scenarios = matrix.scenarios.filter(({ id }) => !selected.size || selected.has(id));
  if (!scenarios.length) throw new Error('No E2E scenarios matched the requested selection.');

  const runId = options.runId ?? new Date().toISOString().replace(/[:.]/g, '-');
  const outputRoot = path.resolve(options.outputRoot ?? path.join(REPO_ROOT, '.omp', 'e2e-results', runId));
  await mkdir(outputRoot, { recursive: true });

  const beforeConfig = readAutolearnConfig();
  const beforeAdvisorConfig = readAdvisorConfig();
  const results = [];
  for (const scenario of scenarios) {
    const repetitions = options.repeat ?? scenario.repeat ?? matrix.defaults?.repeat ?? 1;
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      results.push(await runScenario({
        matrix,
        scenario,
        repetition,
        outputRoot,
        dryRun: options.dryRun === true,
      }));
    }
  }
  const afterConfig = readAutolearnConfig();
  const afterAdvisorConfig = readAdvisorConfig();
  const configStable = JSON.stringify(beforeConfig) === JSON.stringify(afterConfig);
  const advisorConfigStable = JSON.stringify(beforeAdvisorConfig) === JSON.stringify(afterAdvisorConfig);
  const report = {
    version: 1,
    runId,
    matrix: path.relative(REPO_ROOT, matrixPath),
    startedFrom: process.cwd(),
    autolearn: { before: beforeConfig, after: afterConfig, stable: configStable },
    advisor: { before: beforeAdvisorConfig, after: afterAdvisorConfig, stable: advisorConfigStable },
    passed: configStable && advisorConfigStable && results.every(({ evaluation }) => evaluation.pass),
    results,
  };
  await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return { report, outputRoot };
}

async function runScenario({ matrix, scenario, repetition, outputRoot, dryRun }) {
  const prepared = await prepareScenario(scenario);
  const runName = `${scenario.id}-${String(repetition).padStart(2, '0')}`;
  const runDir = path.join(outputRoot, runName);
  const sessionDir = path.join(runDir, 'session');
  await mkdir(sessionDir, { recursive: true });
  const advisorEnabled = scenario.advisor ?? matrix.defaults?.advisor ?? false;
  const configOverlayPath = path.join(runDir, 'config-overlay.yml');
  await writeFile(configOverlayPath, `advisor:\n  enabled: ${advisorEnabled ? 'true' : 'false'}\n`);
  const expectations = { ...(matrix.defaults?.expectations ?? {}), ...(scenario.expectations ?? {}) };
  const timeoutSeconds = scenario.timeoutSeconds ?? matrix.defaults?.timeoutSeconds ?? 120;
  const executionMode = scenario.executionMode ?? matrix.defaults?.executionMode ?? 'print';
  const args = buildOmpArgs({ matrix, scenario, prepared, sessionDir, timeoutSeconds, executionMode, configOverlayPath, advisorEnabled });

  if (dryRun) {
    const result = {
      scenarioId: scenario.id,
      repetition,
      cwd: prepared.cwd,
      command: ['omp', ...args],
      runtimeConfig: { advisorEnabled },
      dryRun: true,
      evaluation: { pass: true, failures: [] },
    };
    await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
    await prepared.cleanup();
    return result;
  }

  const beforeFiles = prepared.verifyRoot ? await snapshotTree(prepared.verifyRoot) : null;
  const execution = executionMode === 'rpc'
    ? await spawnRpcCaptured('omp', args, {
      cwd: prepared.cwd,
      prompt: prepared.prompt,
      timeoutMs: (timeoutSeconds + 30) * 1000,
      waitForAutolearn: scenario.waitForAutolearn === true,
    })
    : await spawnCaptured('omp', args, {
      cwd: prepared.cwd,
      timeoutMs: (timeoutSeconds + 30) * 1000,
    });
  await writeFile(path.join(runDir, 'events.ndjson'), execution.stdout);
  await writeFile(path.join(runDir, 'stderr.log'), execution.stderr);

  const parsed = parseNdjson(execution.stdout);
  const sessionCustomEvents = await readSessionCustomEvents(sessionDir);
  const summary = summarizeWorkflowEvents(mergeCustomEventFallbacks(parsed.events, sessionCustomEvents), {
    scenarioId: scenario.id,
    exitCode: execution.exitCode,
    signal: execution.signal,
    durationMs: execution.durationMs,
    timedOut: execution.timedOut,
    invalidJsonLines: parsed.invalidLines,
  });
  const fileEvaluation = beforeFiles && prepared.verifyRoot
    ? await verifyFixture(prepared.verifyRoot, beforeFiles, scenario.fixtureExpectations ?? {})
    : { pass: true, failures: [], changedFiles: [] };
  const evaluation = evaluateWorkflowSummary(summary, expectations);
  evaluation.failures.push(...fileEvaluation.failures);
  evaluation.pass = evaluation.failures.length === 0;

  const result = {
    scenarioId: scenario.id,
    category: scenario.category,
    repetition,
    cwd: prepared.displayCwd ?? prepared.cwd,
    command: ['omp', ...args.map((arg) => arg === prepared.prompt ? '<prompt>' : arg)],
    runtimeConfig: { advisorEnabled },
    summary,
    fileEvaluation,
    evaluation,
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
  await prepared.cleanup();
  return result;
}

function buildOmpArgs({ matrix, scenario, prepared, sessionDir, timeoutSeconds, executionMode, configOverlayPath, advisorEnabled }) {
  const model = scenario.model ?? matrix.defaults?.model ?? 'opencode-go/deepseek-v4-flash';
  const thinking = scenario.thinking ?? matrix.defaults?.thinking ?? 'minimal';
  const tools = scenario.tools ?? matrix.defaults?.tools ?? ['read', 'grep', 'glob'];
  const args = [
    `--mode=${executionMode === 'rpc' ? 'rpc' : 'json'}`,
    `--model=${model}`,
    `--thinking=${thinking}`,
    `--approval-mode=${scenario.approvalMode ?? matrix.defaults?.approvalMode ?? 'yolo'}`,
    `--config=${configOverlayPath}`,
    `--session-dir=${sessionDir}`,
    '--no-title',
    `--max-time=${timeoutSeconds}`,
    `--tools=${tools.join(',')}`,
  ];
  if (advisorEnabled) args.push('--advisor');
  if (executionMode !== 'rpc') args.push('-p', prepared.prompt);
  return args;
}

export async function prepareScenario(scenario) {
  if (!scenario.fixture) {
    const cwd = path.resolve(scenario.cwd);
    const info = await stat(cwd);
    if (!info.isDirectory()) throw new Error(`Scenario cwd is not a directory: ${cwd}`);
    return { cwd, displayCwd: cwd, prompt: scenario.prompt, cleanup: async () => undefined };
  }

  const cwd = await mkdtemp(path.join(os.tmpdir(), `omp-e2e-${scenario.id}-`));
  if (scenario.fixture === 'autolearn-five-files') {
    for (const [index, token] of ['amber-17', 'birch-29', 'cobalt-41', 'delta-53', 'ember-67'].entries()) {
      await writeFile(path.join(cwd, `${index + 1}.txt`), `${token}\n`);
    }
  } else if (scenario.fixture === 'semantic-edit-en') {
    await writeFile(
      path.join(cwd, 'paper.tex'),
      'Our analysis typically finds a significantly lower failure rate, but it may only reduce errors from 37.5\\% to 12.5\\% and cannot eliminate them \\cite{smith2025}.\n',
    );
  } else if (scenario.fixture === 'semantic-edit-zh') {
    await writeFile(
      path.join(cwd, 'paper.md'),
      '该方法通常可以显著降低错误率，但可能仅将错误率从 37.5% 降至 12.5%，并不能完全消除错误，相关结论见 [@smith2025]。\n',
    );
  } else {
    throw new Error(`Unknown fixture: ${scenario.fixture}`);
  }

  return {
    cwd,
    displayCwd: `<temporary:${scenario.fixture}>`,
    prompt: scenario.prompt,
    verifyRoot: scenario.fixture.startsWith('semantic-edit-') ? cwd : null,
    cleanup: async () => rm(cwd, { recursive: true, force: true }),
  };
}

async function verifyFixture(root, beforeFiles, expectations) {
  const afterFiles = await snapshotTree(root);
  const changedFiles = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])]
    .filter((file) => beforeFiles.get(file) !== afterFiles.get(file))
    .sort();
  const failures = [];
  const allowed = new Set(expectations.allowedChangedFiles ?? []);
  for (const file of changedFiles) {
    if (!allowed.has(file)) failures.push(`unexpected fixture file change: ${file}`);
  }
  for (const file of expectations.requiredChangedFiles ?? []) {
    if (!changedFiles.includes(file)) failures.push(`expected fixture file was not changed: ${file}`);
  }
  for (const [file, patterns] of Object.entries(expectations.requiredPatterns ?? {})) {
    let text = '';
    try {
      text = await readFile(path.join(root, file), 'utf8');
    } catch {
      failures.push(`required fixture output is unreadable: ${file}`);
      continue;
    }
    for (const pattern of patterns) {
      if (!new RegExp(pattern, 'iu').test(text)) failures.push(`semantic sentinel was lost in ${file}: ${pattern}`);
    }
  }
  return { pass: failures.length === 0, failures, changedFiles };
}

async function snapshotTree(root) {
  const values = new Map();
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join('/');
        values.set(relative, createHash('sha256').update(await readFile(full)).digest('hex'));
      }
    }
  }
  await walk(root);
  return values;
}

async function readSessionCustomEvents(root) {
  const relevantTypes = new Set([
    'advisor',
    'autolearn-nudge',
    'omp-continuation',
    'omp-enhancer-continuation',
    'session-stop-continuation',
  ]);
  const events = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const parsed = parseNdjson(await readFile(full, 'utf8'));
      for (const value of parsed.events) {
        const candidate = value?.message?.role === 'custom'
          ? value.message
          : value?.type === 'custom' || value?.customType ? value : null;
        if (relevantTypes.has(candidate?.customType)) {
          events.push({ type: 'session_custom', entry: candidate });
        }
      }
    }
  }
  await walk(root);
  return events;
}

function spawnCaptured(command, args, { cwd, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr: `${stderr}${error.stack ?? error.message}\n`, exitCode: 1, signal: null, timedOut, durationMs: Date.now() - startedAt });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr: `${stderr}${timedOut ? '\nRunner hard timeout reached.\n' : ''}`,
        exitCode: code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function spawnRpcCaptured(command, args, {
  cwd,
  prompt,
  timeoutMs,
  waitForAutolearn = false,
}) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let lineBuffer = '';
    let timedOut = false;
    let captureSeen = false;
    let agentEnds = 0;
    let inputClosed = false;

    const closeInput = () => {
      if (inputClosed || child.stdin.destroyed) return;
      inputClosed = true;
      child.stdin.end();
    };
    const inspectLine = (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (event?.type === 'message_end'
        && event?.message?.role === 'custom'
        && event.message.customType === 'autolearn-nudge') {
        captureSeen = true;
      }
      if (event?.type === 'agent_end') {
        agentEnds += 1;
        const complete = waitForAutolearn
          ? captureSeen && agentEnds >= 2
          : agentEnds >= 1;
        if (complete) setTimeout(closeInput, 100).unref();
      }
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      lineBuffer += chunk;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) inspectLine(line);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', (error) => {
      if (error?.code !== 'EPIPE') stderr += `${error.stack ?? error.message}\n`;
    });
    child.stdin.write(`${JSON.stringify({ id: 'e2e-prompt', type: 'prompt', message: prompt })}\n`);

    const timer = setTimeout(() => {
      timedOut = true;
      closeInput();
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ stdout, stderr: `${stderr}${error.stack ?? error.message}\n`, exitCode: 1, signal: null, timedOut, durationMs: Date.now() - startedAt });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr: `${stderr}${timedOut ? '\nRunner hard timeout reached.\n' : ''}`,
        exitCode: code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function readAutolearnConfig() {
  return readOmpConfig([
    'autolearn.enabled',
    'autolearn.autoContinue',
    'autolearn.minToolCalls',
  ]);
}

function readAdvisorConfig() {
  return readOmpConfig([
    'advisor.enabled',
    'advisor.syncBacklog',
    'advisor.immuneTurns',
  ]);
}

function readOmpConfig(keys) {
  return Object.fromEntries(keys.map((key) => {
    const result = spawnSync('omp', ['config', 'get', key], { encoding: 'utf8' });
    return [key, result.status === 0 ? result.stdout.trim() : `ERROR:${result.stderr.trim()}`];
  }));
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = { scenarioIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') options.dryRun = true;
    else if (value === '--scenario') options.scenarioIds.push(argv[++index]);
    else if (value === '--repeat') options.repeat = Number(argv[++index]);
    else if (value === '--matrix') options.matrixPath = argv[++index];
    else if (value === '--output') options.outputRoot = argv[++index];
    else if (value === '--run-id') options.runId = argv[++index];
    else if (value === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

async function main() {
  const options = parseCliArgs();
  if (options.help) {
    process.stdout.write('Usage: run-installed-deepseek-workflow.mjs [--scenario ID] [--repeat N] [--dry-run] [--output DIR]\n');
    return;
  }
  const { report, outputRoot } = await runInstalledMatrix(options);
  process.stdout.write(`${JSON.stringify({ passed: report.passed, outputRoot, results: report.results.map(({ scenarioId, repetition, evaluation }) => ({ scenarioId, repetition, ...evaluation })) }, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
