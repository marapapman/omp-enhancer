import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPathRisks } from '../src/path-policy.js';
import { listAssets } from '../src/asset-index.js';
import { runConfigDoctor } from '../src/doctor.js';
import { formatDoctorReport } from '../src/report.js';
import registerOmpConfig, { runConfigPlan } from '../index.js';
import { resolvePluginRoot } from '../src/plugin-root.js';

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

test('packaged model roles use DeepSeek Flash as main and GLM as advisor', async () => {
  const config = await readFile(path.join(packageRoot(), 'assets', 'config.yml'), 'utf8');

  assert.match(config, /default:\s+opencode-go\/deepseek-v4-flash:medium/);
  assert.match(config, /advisor:\s+ollama-cloud\/glm-5\.2:xhigh/);
  assert.match(config, /tiny:\s+opencode-go\/deepseek-v4-flash:medium/);
  assert.match(config, /modelPattern:\s+deepseek-v4-flash/);
  assert.match(config, /loopGuard:\s*\n\s+enabled:\s+false/);
  assert.match(config, /compaction:[\s\S]*autoContinue:\s+false/);
  assert.doesNotMatch(config, /maxRecoveryAttempts|fallbackRole|noProgressSeconds/);
});

test('bundled agents are advisory and declare no blocking metadata', async () => {
  const agentDir = path.join(packageRoot(), 'agents');
  const agentFiles = (await readdir(agentDir)).filter((name) => name.endsWith('.md'));

  for (const agentFile of agentFiles) {
    const content = await readFile(path.join(agentDir, agentFile), 'utf8');
    assert.doesNotMatch(content, /^blocking:\s*true\s*$/mu, agentFile);
  }
});

async function writePluginPackage(root) {
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'omp-config' }));
}

function packageRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

const expectedBundledSkills = [
  'astrbot-plugin-development',
  'beamer-to-powerpoint',
  'brainstorming',
  'canvas-design',
  'caveman',
  'conventional-commits',
  'deepseek-tool-calling',
  'diagnose',
  'dispatching-parallel-agents',
  'docx',
  'docker-compose',
  'executing-plans',
  'finishing-a-development-branch',
  'frontend-design',
  'go-testing',
  'grill-with-docs',
  'handoff',
  'improve-codebase-architecture',
  'latex-beamer-slides',
  'omp-marketplace-plugin-activation',
  'plan-execute-review-commit',
  'prototype',
  'receiving-code-review',
  'requesting-code-review',
  'slides-storyline',
  'spike',
  'subagent-driven-development',
  'systematic-debugging',
  'tdd',
  'test-driven-development',
  'using-git-worktrees',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
  'writing-skills',
  'zoom-out',
];

function createRegistrationHarness() {
  const tools = [];
  const commands = new Map();
  const pi = {
    zod: {
      z: {
        string: () => ({ optional: () => ({ type: 'optional-string' }) }),
        boolean: () => ({ optional: () => ({ type: 'optional-boolean' }) }),
        optional: (schema) => ({ type: 'optional', schema }),
        object: (shape) => ({ type: 'object', shape }),
      },
    },
    setLabel(label) {
      this.label = label;
    },
    registerTool(tool) {
      tools.push(tool);
    },
    registerCommand(name, command) {
      commands.set(name, command);
    },
  };

  registerOmpConfig(pi);
  return { pi, tools, commands };
}

async function findSkillDirs(rootDir) {
  const result = [];
  await walk(rootDir);
  return result;

  async function walk(dir) {
    if (await hasSkillDoc(dir)) result.push(dir);

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      await walk(path.join(dir, entry.name));
    }
  }
}

async function hasSkillDoc(dir) {
  try {
    await access(path.join(dir, 'SKILL.md'));
    return true;
  } catch {
    return false;
  }
}

test('listAssets lists packaged agents, skills, hooks, and templates from plugin root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-assets-'));
  await writePluginPackage(root);
  await mkdir(path.join(root, 'agents'));
  await mkdir(path.join(root, 'skills'));
  await mkdir(path.join(root, 'hooks', 'pre'), { recursive: true });
  await mkdir(path.join(root, 'hooks', 'post'), { recursive: true });
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets', 'config.yml'), 'packaged template\n');
  await writeFile(path.join(root, 'assets', '.secret'), 'hidden template\n');
  await writeFile(path.join(root, 'agents', 'task.md'), '# Task');
  await writeFile(path.join(root, 'agents', '.hidden.md'), '# Hidden');
  await mkdir(path.join(root, 'skills', 'tdd'));
  await writeFile(path.join(root, 'skills', 'tdd', 'SKILL.md'), '# TDD');
  await writeFile(path.join(root, 'hooks', 'pre', 'guard-destructive.ts'), 'export default {};\n');
  await writeFile(path.join(root, 'hooks', 'pre', '.hidden.ts'), 'export default {};\n');
  await writeFile(path.join(root, 'hooks', 'post', 'truncate-output.ts'), 'export default {};\n');

  const assets = await listAssets(root);

  assert.deepEqual(assets, {
    agents: ['task.md'],
    skills: ['tdd'],
    hooks: {
      pre: ['guard-destructive.ts'],
      post: ['truncate-output.ts'],
    },
    templates: ['config.yml'],
  });
});

test('package manifest declares bundled skills as plugin content', async () => {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot(), 'package.json'), 'utf8'));

  assert.ok(packageJson.files.includes('skills'));
  assert.deepEqual(packageJson.pi?.skills, ['./skills']);
  assert.ok(packageJson.keywords.includes('skills'));
  assert.ok(packageJson.keywords.includes('omp-plugin'));
});

test('packaged config template keeps DeepSeek Flash as default and GLM as advisor', async () => {
  const template = await readFile(path.join(packageRoot(), 'assets', 'config.yml'), 'utf8');

  assert.match(template, /advisor:\s*ollama-cloud\/glm-5\.2:xhigh/);
  assert.match(template, /tiny:\s*opencode-go\/deepseek-v4-flash:medium/);
  assert.doesNotMatch(template, /classifier:\s*opencode-go\/deepseek-v4-flash:medium/);
  assert.doesNotMatch(template, /modelTags:\s*\n\s*classifier:/);
  assert.match(template, /default:\s*opencode-go\/deepseek-v4-flash:medium/);
  assert.match(template, /plan:\s*ollama-cloud\/deepseek-v4-pro:high/);
  assert.match(template, /task:\s*ollama-cloud\/deepseek-v4-flash:high/);
  assert.match(template, /webSearch:\s*codex/);
  assert.match(template, /backend:\s*mnemopi/);
  assert.doesNotMatch(template, /disabledProviders:\s*\n\s*-\s*deepseek/);
  assert.doesNotMatch(template, /task:\s*opencode-go\/deepseek/);
});

test('packaged advisor guidance audits autonomous workflow selection and converges before one final', async () => {
  const watchdog = await readFile(path.join(packageRoot(), 'assets', 'WATCHDOG.yml'), 'utf8');

  assert.match(watchdog, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(watchdog, /selected workflow, TODO coverage, skill use, and delegation/);
  assert.match(watchdog, /multiple subagents/);
  assert.match(watchdog, /Do not ask for `omp_core_route_task`/);
  assert.match(watchdog, /Once the main agent has emitted a complete final response, do not call `advise`/);
  assert.match(watchdog, /at most one `advise` call for a primary task/);
  assert.match(watchdog, /judge the concrete candidate rather than freezing the whole task/);
  assert.match(watchdog, /Reserve `blocker` for an imminent authorization violation/);
  assert.match(watchdog, /suggestions, not execution or completion gates/);
  assert.doesNotMatch(watchdog, /block:\s*true|continue:\s*true|triggerTurn/);
});

test('ships every omp-config skill from the plugin skills directory', async () => {
  const skillsRoot = path.join(packageRoot(), 'skills');
  const actualSkills = (await findSkillDirs(skillsRoot))
    .map((skillPath) => path.relative(skillsRoot, skillPath).split(path.sep).join('/'))
    .sort();

  for (const skill of expectedBundledSkills) {
    assert.ok(actualSkills.includes(skill), `${skill} should be bundled`);
    const skillPath = path.join(skillsRoot, skill, 'SKILL.md');
    const skillDoc = await readFile(skillPath, 'utf8');
    assert.match(skillDoc, /\S/, `${skill} should ship a non-empty SKILL.md`);
  }

  assert.equal(actualSkills.length, 285);
  assert.ok(actualSkills.includes('ecc/accessibility'));
  assert.ok(actualSkills.includes('ecc/tdd-workflow'));
  assert.ok(actualSkills.includes('ecc/workspace-surface-audit'));
});

test('runConfigDoctor reads packaged config assets and reports path risks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-doctor-'));
  await mkdir(path.join(root, 'assets'));
  await writePluginPackage(root);
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

test('resolvePluginRoot falls back from a workspace root with top-level OMP directories to the packaged plugin root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-workspace-'));
  await mkdir(path.join(root, 'agents'));
  await mkdir(path.join(root, 'skills'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets', 'config.yml'), 'workspace template\n');

  const pluginRoot = path.join(root, 'plugins', 'omp-config');
  await mkdir(path.join(pluginRoot, 'assets'), { recursive: true });
  await mkdir(path.join(pluginRoot, 'agents'));
  await mkdir(path.join(pluginRoot, 'skills'));
  await writeFile(path.join(pluginRoot, 'assets', 'config.yml'), 'packaged template\n');
  await writePluginPackage(pluginRoot);

  assert.equal(await resolvePluginRoot(root), pluginRoot);
});

test('runConfigPlan resolves packaged assets from a workspace root', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-plan-workspace-'));
  await mkdir(path.join(root, 'agents'));
  await mkdir(path.join(root, 'skills'));
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets', 'config.yml'), 'workspace template\n');

  const pluginRoot = path.join(root, 'plugins', 'omp-config');
  await mkdir(path.join(pluginRoot, 'assets'), { recursive: true });
  await writeFile(path.join(pluginRoot, 'assets', 'config.yml'), 'packaged template\n');
  await writePluginPackage(pluginRoot);

  const result = await runConfigPlan({ root });

  assert.equal(result.plan[0], `Review packaged templates under ${pluginRoot}/assets.`);
  assert.match(result.plan[1], /assets\/WATCHDOG\.yml/);
});

test('registered defaults resolve bundled package assets from a normal project cwd', async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), 'omp-config-normal-project-'));
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'normal-project' }));
  const bundledRoot = packageRoot();
  const { tools, commands } = createRegistrationHarness();

  const doctor = tools.find((tool) => tool.name === 'omp_config_doctor');
  const doctorResult = await doctor.execute('call-1', {}, undefined, undefined, { cwd: projectRoot });
  assert.equal(doctorResult.isError, false);
  assert.equal(doctorResult.details.summary, '1 config risk(s) found.');
  assert.equal(doctorResult.details.findings[0].path, 'assets/config.yml');

  const assets = tools.find((tool) => tool.name === 'omp_config_assets');
  const assetsResult = await assets.execute('call-2', {}, undefined, undefined, { cwd: projectRoot });
  assert.ok(assetsResult.details.agents.includes('task.md'));
  assert.ok(assetsResult.details.skills.includes('tdd'));
  assert.ok(assetsResult.details.hooks.pre.includes('guard-destructive.ts'));
  assert.ok(assetsResult.details.hooks.post.includes('truncate-output.ts'));
  assert.ok(assetsResult.details.templates.includes('config.yml'));
  assert.ok(assetsResult.details.templates.includes('WATCHDOG.yml'));

  const plan = tools.find((tool) => tool.name === 'omp_config_plan');
  const planResult = await plan.execute('call-3', {}, undefined, undefined, { cwd: projectRoot });
  assert.equal(planResult.isError, false);
  assert.equal(planResult.details.plan[0], `Review packaged templates under ${bundledRoot}/assets.`);

  const originalCwd = process.cwd();
  try {
    process.chdir(projectRoot);
    const commandDoctor = await commands.get('config-doctor').handler('');
    assert.equal(commandDoctor.summary, '1 config risk(s) found.');

    const commandAssets = await commands.get('config-assets').handler('');
    assert.ok(commandAssets.agents.includes('task.md'));
    assert.ok(commandAssets.skills.includes('tdd'));
    assert.ok(commandAssets.hooks.pre.includes('guard-destructive.ts'));
    assert.ok(commandAssets.hooks.post.includes('truncate-output.ts'));
    assert.ok(commandAssets.templates.includes('config.yml'));
    assert.ok(commandAssets.templates.includes('WATCHDOG.yml'));

    const directPlan = await runConfigPlan();
    assert.equal(directPlan.plan[0], `Review packaged templates under ${bundledRoot}/assets.`);
  } finally {
    process.chdir(originalCwd);
  }
});

test('index registers doctor assets and plan tools safely', async () => {
  const registered = [];
  const pi = {
    zod: {
      z: {
        string: () => ({ optional: () => ({ type: 'optional-string' }) }),
        boolean: () => ({ optional: () => ({ type: 'optional-boolean' }) }),
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
    'omp_config_sync_workflow_context',
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
  await writeFile(path.join(root, 'skills', 'tdd', 'SKILL.md'), '# TDD');

  await writePluginPackage(root);
  const doctor = registered.find((tool) => tool.name === 'omp_config_doctor');
  const doctorResult = await doctor.execute('call-1', { root }, undefined, undefined, { cwd: process.cwd() });
  assert.equal(doctorResult.isError, false);
  assert.equal(doctorResult.details.ok, false);
  assert.match(doctorResult.content[0].text, /hardcoded-root-home/);

  const assets = registered.find((tool) => tool.name === 'omp_config_assets');
  const assetsResult = await assets.execute('call-2', { root }, undefined, undefined, { cwd: process.cwd() });
  assert.deepEqual(assetsResult.details, {
    agents: ['task.md'],
    skills: ['tdd'],
    hooks: { pre: [], post: [] },
    templates: ['config.yml'],
  });

  const plan = registered.find((tool) => tool.name === 'omp_config_plan');
  const planResult = await plan.execute('call-3', { root }, undefined, undefined, { cwd: process.cwd() });
  assert.equal(planResult.isError, false);
  assert.match(planResult.content[0].text, /# OMP Config Patch Plan/);
});
