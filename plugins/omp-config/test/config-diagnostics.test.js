import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findPathRisks } from '../src/path-policy.js';
import { listAssets } from '../src/asset-index.js';
import { runConfigDoctor } from '../src/doctor.js';
import { formatDoctorReport } from '../src/report.js';
import registerOmpConfig from '../index.js';

test('findPathRisks reports hardcoded root home paths', () => {
  const findings = findPathRisks('customDirectories:\n  - /root/.omp/skills\n', 'config.yml');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'hardcoded-root-home');
  assert.equal(findings[0].severity, 'warning');
  assert.equal(findings[0].path, 'config.yml');
  assert.match(findings[0].evidence, /\/root\/\.omp\/skills/);
  assert.equal(findings[0].safeToAutoFix, false);
});

test('findPathRisks reports hardcoded Claude root home paths', () => {
  const findings = findPathRisks('include: /root/.claude/CLAUDE.md\n', 'assets/config.yml');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].id, 'hardcoded-root-home');
  assert.match(findings[0].evidence, /\/root\/\.claude\/CLAUDE\.md/);
});

test('listAssets lists packaged agents and skills from plugin root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-assets-'));
  await mkdir(path.join(root, 'agents'));
  await mkdir(path.join(root, 'skills'));
  await writeFile(path.join(root, 'agents', 'task.md'), '# Task');
  await writeFile(path.join(root, 'agents', '.hidden.md'), '# Hidden');
  await mkdir(path.join(root, 'skills', 'tdd'));

  const assets = await listAssets(root);

  assert.deepEqual(assets, {
    agents: ['task.md'],
    skills: ['tdd'],
  });
});

test('runConfigDoctor reads packaged config assets and reports path risks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-doctor-'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets', 'config.yml'), 'customDirectories:\n  - /root/.omp/skills\n');

  const result = await runConfigDoctor(root);

  assert.equal(result.ok, false);
  assert.equal(result.summary, '1 config risk(s) found.');
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].path, 'assets/config.yml');
});

test('formatDoctorReport renders summary and findings', () => {
  const report = formatDoctorReport({
    ok: false,
    summary: '1 config risk(s) found.',
    findings: [
      {
        id: 'hardcoded-root-home',
        severity: 'warning',
        problem: 'Config contains hardcoded /root home paths.',
        suggestion: 'Replace /root paths with user home relative paths or documented local paths.',
      },
    ],
  });

  assert.match(report, /^# OMP Config Doctor/);
  assert.match(report, /1 config risk\(s\) found\./);
  assert.match(report, /## hardcoded-root-home/);
  assert.match(report, /Severity: warning/);
});

test('index registers doctor assets and plan tools safely', async () => {
  const registered = [];
  const pi = {
    zod: {
      z: {
        string: () => ({ optional: () => ({ type: 'optional-string' }) }),
        optional: (schema) => ({ type: 'optional', schema }),
        object: (shape) => ({ type: 'object', shape }),
      },
    },
    setLabel(label) {
      this.label = label;
    },
    registerTool(tool) {
      registered.push(tool);
    },
  };

  registerOmpConfig(pi);

  assert.equal(pi.label, 'OMP Config');
  assert.deepEqual(registered.map((tool) => tool.name), [
    'omp_config_doctor',
    'omp_config_assets',
    'omp_config_plan',
  ]);

  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-index-'));
  await mkdir(path.join(root, 'assets'));
  await mkdir(path.join(root, 'agents'));
  await mkdir(path.join(root, 'skills'));
  await writeFile(path.join(root, 'assets', 'config.yml'), 'customDirectories:\n  - /root/.omp/skills\n');
  await writeFile(path.join(root, 'agents', 'task.md'), '# Task');
  await mkdir(path.join(root, 'skills', 'tdd'));

  const doctor = registered.find((tool) => tool.name === 'omp_config_doctor');
  const doctorResult = await doctor.execute('call-1', { root }, undefined, undefined, { cwd: process.cwd() });
  assert.equal(doctorResult.isError, false);
  assert.equal(doctorResult.details.ok, false);
  assert.match(doctorResult.content[0].text, /hardcoded-root-home/);

  const assets = registered.find((tool) => tool.name === 'omp_config_assets');
  const assetsResult = await assets.execute('call-2', { root }, undefined, undefined, { cwd: process.cwd() });
  assert.deepEqual(assetsResult.details, { agents: ['task.md'], skills: ['tdd'] });

  const plan = registered.find((tool) => tool.name === 'omp_config_plan');
  const planResult = await plan.execute('call-3', { root }, undefined, undefined, { cwd: process.cwd() });
  assert.equal(planResult.isError, false);
  assert.match(planResult.content[0].text, /# OMP Config Patch Plan/);
});
