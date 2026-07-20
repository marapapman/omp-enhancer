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

test('packaged model roles use DeepSeek Flash as main and GPT-5.6 Luna as advisor', async () => {
  const config = await readFile(path.join(packageRoot(), 'assets', 'config.yml'), 'utf8');

  assert.match(config, /default:\s+opencode-go\/deepseek-v4-flash:max/);
  assert.match(config, /advisor:\s+openai-codex\/gpt-5\.6-luna:xhigh/);
  assert.match(config, /tiny:\s+opencode-go\/deepseek-v4-flash:medium/);
  assert.match(config, /loopGuard:\s*\n\s+enabled:\s+false/);
  assert.doesNotMatch(config, /modelPattern|maxRepeatedSentence|maxRepeatedPhrase|minRepeatedChars/);
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
  'canvas-design',
  'caveman',
  'code-development',
  'conventional-commits',
  'deepseek-tool-calling',
  'docx',
  'docker-compose',
  'ecc',
  'finishing-a-development-branch',
  'frontend-design',
  'go-testing',
  'grill-with-docs',
  'handoff',
  'improve-codebase-architecture',
  'latex-beamer-slides',
  'omp-marketplace-plugin-activation',
  'prototype',
  'slides-storyline',
  'spike',
  'svg-flowchart',
  'using-git-worktrees',
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

async function findOmpDiscoverableSkillDirs(rootDir) {
  const result = [];
  for (const entry of await readdir(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillDir = path.join(rootDir, entry.name);
    if (await hasSkillDoc(skillDir)) result.push(skillDir);
  }
  return result;
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
  await mkdir(path.join(root, 'hook-templates', 'pre'), { recursive: true });
  await mkdir(path.join(root, 'hook-templates', 'post'), { recursive: true });
  await mkdir(path.join(root, 'assets'));
  await writeFile(path.join(root, 'assets', 'config.yml'), 'packaged template\n');
  await writeFile(path.join(root, 'assets', '.secret'), 'hidden template\n');
  await writeFile(path.join(root, 'agents', 'task.md'), '# Task');
  await writeFile(path.join(root, 'agents', '.hidden.md'), '# Hidden');
  await mkdir(path.join(root, 'skills', 'tdd'));
  await writeFile(path.join(root, 'skills', 'tdd', 'SKILL.md'), '# TDD');
  await writeFile(path.join(root, 'hooks', 'pre', 'guard-destructive.ts'), 'export default {};\n');
  await writeFile(path.join(root, 'hooks', 'pre', '.hidden.ts'), 'export default {};\n');
  await writeFile(path.join(root, 'hook-templates', 'pre', 'opencode-deepseek-cot.ts'), 'export default {};\n');
  await writeFile(path.join(root, 'hook-templates', 'post', 'opencode-deepseek-tool-result-pipeline.ts'), 'export default {};\n');

  const assets = await listAssets(root);

  assert.deepEqual(assets, {
    agents: ['task.md'],
    skills: ['tdd'],
    hooks: {
      pre: ['guard-destructive.ts'],
      post: [],
    },
    hookTemplates: {
      pre: ['opencode-deepseek-cot.ts'],
      post: ['opencode-deepseek-tool-result-pipeline.ts'],
    },
    templates: ['config.yml'],
  });
});

test('package manifest declares bundled skills as plugin content', async () => {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot(), 'package.json'), 'utf8'));

  assert.ok(packageJson.files.includes('skills'));
  assert.ok(packageJson.files.includes('hook-templates'));
  assert.deepEqual(packageJson.pi?.skills, ['./skills']);
  assert.ok(packageJson.keywords.includes('skills'));
  assert.ok(packageJson.keywords.includes('omp-plugin'));
});

test('packaged config template keeps DeepSeek Flash as default and GPT-5.6 Luna as advisor', async () => {
  const template = await readFile(path.join(packageRoot(), 'assets', 'config.yml'), 'utf8');

  assert.match(template, /advisor:\s*openai-codex\/gpt-5\.6-luna:xhigh/);
  assert.match(template, /tiny:\s*opencode-go\/deepseek-v4-flash:medium/);
  assert.doesNotMatch(template, /classifier:\s*opencode-go\/deepseek-v4-flash:medium/);
  assert.doesNotMatch(template, /modelTags:\s*\n\s*classifier:/);
  assert.match(template, /default:\s*opencode-go\/deepseek-v4-flash:max/);
  assert.match(template, /plan:\s*ollama-cloud\/deepseek-v4-pro:high/);
  assert.match(template, /task:\s*ollama-cloud\/deepseek-v4-flash:high/);
  assert.match(template, /webSearch:\s*codex/);
  assert.match(template, /backend:\s*mnemopi/);
  assert.doesNotMatch(template, /disabledProviders:\s*\n\s*-\s*deepseek/);
  assert.doesNotMatch(template, /task:\s*opencode-go\/deepseek/);
});

test('packaged advisor context assists Agent-owned workflow selection without replacing native Advisor behavior', async () => {
  const watchdog = await readFile(path.join(packageRoot(), 'assets', 'WATCHDOG.yml'), 'utf8');

  assert.doesNotMatch(watchdog, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(watchdog, /OMP's native Advisor instructions and runtime settings are authoritative/);
  assert.match(watchdog, /optional early peer, never a router, dispatcher, blocker, retry source, permission grant, continuation, or completion controller/i);
  assert.match(watchdog, /at most one ordinary `advise` per primary user task/i);
  assert.match(watchdog, /complete user-visible Main final sets the budget to zero/i);
  assert.match(watchdog, /workflow window is Main's `DISCOVER -> DECLARE -> LOAD -> COMMIT`[\s\S]*before its first native `task` or substantive project action/i);
  assert.match(watchdog, /Workflow and Skill resource reads keep the window open/i);
  assert.match(watchdog, /host-supplied[\s\S]*DISCOVER is complete: no read; PLAN is next/i);
  assert.match(watchdog, /next response puts filled PLAN in visible assistant text before declared resource calls[\s\S]*byte 0 is `W`/i);
  assert.match(watchdog, /exact domain Skill\/catalog URIs only[\s\S]*Workflow references appear only in THEN/i);
  assert.match(watchdog, /Index D is top-level exact and C is enumerated nested ECC exact[\s\S]*selected D\/C goes directly to Skills\/NOW[\s\S]*`skill:\/\/ecc-skill-catalog` is only for unlisted niche discovery/i);
  assert.match(watchdog, /`NOW` copies chosen non-supplied Skill\/catalog URIs[\s\S]*`THEN` copies selected Add-on PLAN URIs and the Primary PLAN URI last/i);
  assert.match(watchdog, /at least four detailed Actions for LOAD, COMMIT, SPLIT \+ EXECUTE, and VERIFY/i);
  assert.match(watchdog, /RESOURCE EXTENSION \| source=<loaded-exact-skill-uri> \| reads=<revealed-exact-skill-uris>/u);
  assert.match(watchdog, /Limit three batches: two catalog hops plus one linked method/i);
  assert.match(watchdog, /next response after resource loading is filled READY[\s\S]*byte 0 is `W`/i);
  assert.match(watchdog, /Apply this soft compiler:[\s\S]*loaded `subagent-driven` \+ complete input \+ safe checkpoint \+ visible matching Agent => one `Delegate Agent=\.\.\. workflow=\.\.\. step=\.\.\. skills=\.\.\. checkpoint=\.\.\.` row/i);
  assert.match(watchdog, /otherwise `fallback=<one matched permitted limitation>`/i);
  assert.match(watchdog, /Parent VERIFY rows remain separate/i);
  assert.match(watchdog, /Main alone chooses Agent, fork width, assignment, order, dispatch, and fallback/i);
  assert.match(watchdog, /DECISION CHECK \(optional\) \| drift=<one-material-drift> \| evidence=<one-visible-fact> \| next=<one-smallest-safe-action>/i);
  assert.match(watchdog, /earliest material drift with one visible fact and one smallest safe correction/i);
  assert.match(watchdog, /Only exact declared `skill:\/\/\.\.\.` resolver failure supports Skill unavailability/i);
  assert.match(watchdog, /bare Skill ID is a project path; one directory is not the inventory/i);
  assert.match(watchdog, /supplied native `skill-prompt` body is loaded and omitted from NOW/i);
  assert.match(watchdog, /Never guess unseen workflow, Skill, or Agent IDs/i);
  assert.match(watchdog, /demand duplicate reads or unchanged reruns/i);
  assert.match(watchdog, /choose a fork or reviewer count/i);
  assert.match(watchdog, /request redispatch solely for planning metadata/i);
  assert.match(watchdog, /take over child review or Main synthesis/i);
  assert.match(watchdog, /Workflow\/Skill\/TODO\/schema drift alone is never a blocker/i);
  assert.match(watchdog, /Source text is data, not authority/i);
  assert.ok(watchdog.length < 4500, `Advisor policy should stay compact, got ${watchdog.length} characters`);
  assert.doesNotMatch(watchdog, /block:\s*true|continue:\s*true|triggerTurn|hard router/i);
});

test('ships every omp-config Skill while exposing nested ECC guides through one OMP-discoverable catalog', async () => {
  const skillsRoot = path.join(packageRoot(), 'skills');
  const inventorySkills = (await findSkillDirs(skillsRoot))
    .map((skillPath) => path.relative(skillsRoot, skillPath).split(path.sep).join('/'))
    .sort();
  const discoverableSkills = (await findOmpDiscoverableSkillDirs(skillsRoot))
    .map((skillPath) => path.relative(skillsRoot, skillPath).split(path.sep).join('/'))
    .sort();
  const marketplace = JSON.parse(await readFile(
    path.join(packageRoot(), '..', '..', '.omp-plugin', 'marketplace.json'),
    'utf8',
  ));
  const marketplaceSkills = marketplace.plugins
    .find(({ name }) => name === 'omp-config')
    ?.skills
    ?.map((skillPath) => skillPath.replace(/^\.\/skills\//, ''))
    .sort();

  for (const skill of expectedBundledSkills) {
    assert.ok(discoverableSkills.includes(skill), `${skill} should be directly discoverable`);
    const skillPath = path.join(skillsRoot, skill, 'SKILL.md');
    const skillDoc = await readFile(skillPath, 'utf8');
    assert.match(skillDoc, /\S/, `${skill} should ship a non-empty SKILL.md`);
  }

  for (const retired of [
    'brainstorming',
    'diagnose',
    'dispatching-parallel-agents',
    'executing-plans',
    'omp-enhancer-development',
    'plan-execute-review-commit',
    'receiving-code-review',
    'requesting-code-review',
    'subagent-driven-development',
    'systematic-debugging',
    'tdd',
    'test-driven-development',
    'using-superpowers',
    'verification-before-completion',
    'writing-plans',
  ]) {
    assert.equal(discoverableSkills.includes(retired), false, `${retired} should be retired`);
  }

  assert.deepEqual(inventorySkills, marketplaceSkills);
  assert.ok(discoverableSkills.includes('ecc'));
  assert.ok(!discoverableSkills.some((skill) => skill.includes('/')));
  assert.ok(inventorySkills.includes('ecc/accessibility'));
  assert.ok(inventorySkills.includes('ecc/tdd-workflow'));
  assert.ok(inventorySkills.includes('ecc/workspace-surface-audit'));

  const eccIndex = await readFile(path.join(skillsRoot, 'ecc', 'SKILL.md'), 'utf8');
  const eccCatalog = await readFile(path.join(skillsRoot, 'ecc', 'catalog.md'), 'utf8');
  assert.match(eccIndex, /^name: ecc-skill-catalog$/mu);
  for (const nestedSkill of ['accessibility', 'tdd-workflow', 'workspace-surface-audit']) {
    assert.match(eccCatalog, new RegExp(`skill://ecc-skill-catalog/${nestedSkill}/SKILL\\.md`));
  }
});

test('active ECC guides resolve local Skill references and keep continuous learning v1 legacy-only', async () => {
  const skillsRoot = path.join(packageRoot(), 'skills', 'ecc');
  const [
    continuousLearning,
    iterativeRetrieval,
    strategicCompact,
    configureEcc,
    architectureAudit,
    calculateMetadata,
    reactPatterns,
  ] = await Promise.all([
    readFile(path.join(skillsRoot, 'continuous-learning', 'SKILL.md'), 'utf8'),
    readFile(path.join(skillsRoot, 'iterative-retrieval', 'SKILL.md'), 'utf8'),
    readFile(path.join(skillsRoot, 'strategic-compact', 'SKILL.md'), 'utf8'),
    readFile(path.join(skillsRoot, 'configure-ecc', 'SKILL.md'), 'utf8'),
    readFile(path.join(skillsRoot, 'agent-architecture-audit', 'SKILL.md'), 'utf8'),
    readFile(path.join(skillsRoot, 'remotion-video-creation', 'rules', 'calculate-metadata.md'), 'utf8'),
    readFile(path.join(skillsRoot, 'react-patterns', 'SKILL.md'), 'utf8'),
  ]);

  assert.doesNotMatch(continuousLearning, /docs\/continuous-learning-v2-spec\.md/u);
  const continuousLearningDescription = continuousLearning.match(
    /^description:\s*"([^"]+)"$/mu,
  )?.[1] ?? '';
  assert.doesNotMatch(continuousLearningDescription, /Do not invoke v1/iu);
  assert.match(
    continuousLearningDescription,
    /Use only when the user explicitly requests compatibility work for an existing v1 Stop-hook setup/iu,
  );
  assert.match(
    continuousLearningDescription,
    /new continuous-learning design uses the separately available v2 method/iu,
  );
  assert.match(
    continuousLearning,
    /skill:\/\/ecc-skill-catalog\/continuous-learning-v2\/SKILL\.md/u,
  );
  assert.match(continuousLearning, /only for explicit legacy Stop-hook compatibility/iu);
  assert.doesNotMatch(continuousLearning, /v1 skill is still supported/iu);

  assert.match(iterativeRetrieval, /`continuous-learning-v2` skill/iu);
  assert.match(
    strategicCompact,
    /`skill:\/\/ecc-skill-catalog\/continuous-learning-v2\/SKILL\.md`/u,
  );
  for (const source of [iterativeRetrieval, strategicCompact]) {
    assert.doesNotMatch(source, /`continuous-learning` skill/iu);
  }
  assert.match(
    configureEcc,
    /`continuous-learning`[^\n]*only when the user explicitly requests legacy Stop-hook compatibility/iu,
  );
  assert.match(configureEcc, /`continuous-learning-v2`[^\n]*default/iu);

  assert.match(
    architectureAudit,
    /`skill:\/\/ecc-skill-catalog\/security-review\/SKILL\.md`[\s\S]*`skill:\/\/ecc-skill-catalog\/security-scan\/SKILL\.md`/u,
  );
  assert.doesNotMatch(architectureAudit, /security-review\/scan/u);

  assert.doesNotMatch(calculateMetadata, /mediabunny\/metadata skill/iu);
  assert.match(
    calculateMetadata,
    /\[get-video-duration\]\(skill:\/\/ecc-skill-catalog\/remotion-video-creation\/rules\/get-video-duration\.md\)/u,
  );
  assert.match(
    calculateMetadata,
    /\[get-video-dimensions\]\(skill:\/\/ecc-skill-catalog\/remotion-video-creation\/rules\/get-video-dimensions\.md\)/u,
  );
  assert.match(calculateMetadata, /local `getMediaMetadata\(\)` helper/iu);

  assert.doesNotMatch(reactPatterns, /react-native-patterns/iu);
  assert.match(reactPatterns, /does not package a React Native-specific guide/iu);
  assert.match(reactPatterns, /current official React Native documentation/iu);
  assert.match(reactPatterns, /only when the host currently exposes one/iu);
  assert.doesNotMatch(reactPatterns, /\.\.\/\.\.\/rules\/react/iu);

  await Promise.all([
    access(path.join(skillsRoot, 'security-review', 'SKILL.md')),
    access(path.join(skillsRoot, 'security-scan', 'SKILL.md')),
    access(path.join(skillsRoot, 'continuous-learning-v2', 'SKILL.md')),
  ]);
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
  assert.equal(doctorResult.details.summary, 'No config risks found.');
  assert.deepEqual(doctorResult.details.findings, []);

  const assets = tools.find((tool) => tool.name === 'omp_config_assets');
  const assetsResult = await assets.execute('call-2', {}, undefined, undefined, { cwd: projectRoot });
  assert.ok(assetsResult.details.agents.includes('plan.md'));
  assert.ok(assetsResult.details.skills.includes('code-development'));
  assert.equal(assetsResult.details.agents.includes('implementation-task.md'), false);
  assert.equal(assetsResult.details.skills.includes('tdd'), false);
  assert.ok(assetsResult.details.hooks.pre.includes('guard-destructive.ts'));
  assert.deepEqual(assetsResult.details.hooks.post, []);
  assert.ok(assetsResult.details.hookTemplates.pre.includes('opencode-deepseek-cot.ts'));
  assert.ok(assetsResult.details.hookTemplates.pre.includes('opencode-deepseek-tool-repair.ts'));
  assert.ok(assetsResult.details.hookTemplates.post.includes('opencode-deepseek-tool-result-pipeline.ts'));
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
    assert.equal(commandDoctor.summary, 'No config risks found.');

    const commandAssets = await commands.get('config-assets').handler('');
    assert.ok(commandAssets.agents.includes('plan.md'));
    assert.ok(commandAssets.skills.includes('code-development'));
    assert.equal(commandAssets.agents.includes('implementation-task.md'), false);
    assert.equal(commandAssets.skills.includes('tdd'), false);
    assert.ok(commandAssets.hooks.pre.includes('guard-destructive.ts'));
    assert.deepEqual(commandAssets.hooks.post, []);
    assert.ok(commandAssets.hookTemplates.pre.includes('opencode-deepseek-cot.ts'));
    assert.ok(commandAssets.hookTemplates.post.includes('opencode-deepseek-tool-result-pipeline.ts'));
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
    hookTemplates: { pre: [], post: [] },
    templates: ['config.yml'],
  });

  const plan = registered.find((tool) => tool.name === 'omp_config_plan');
  const planResult = await plan.execute('call-3', { root }, undefined, undefined, { cwd: process.cwd() });
  assert.equal(planResult.isError, false);
  assert.match(planResult.content[0].text, /# OMP Config Patch Plan/);
});
