import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');
const AGENT_ROOT = path.join(PLUGIN_ROOT, 'agents');
const SKILL_ROOT = path.join(PLUGIN_ROOT, 'skills');

const REMOVED_AGENT_FILES = [
  'config-librarian.md',
  'explore.md',
  'implementation-task.md',
  'omp-target-auditor.md',
  'task.md',
  'quick_task.md',
  'designer.md',
  'librarian.md',
  'reviewer.md',
  'ecc-a11y-architect.md',
  'ecc-architect.md',
  'ecc-build-error-resolver.md',
  'ecc-chief-of-staff.md',
  'ecc-code-architect.md',
  'ecc-code-explorer.md',
  'ecc-code-reviewer.md',
  'ecc-code-simplifier.md',
  'ecc-comment-analyzer.md',
  'ecc-conversation-analyzer.md',
  'ecc-cpp-build-resolver.md',
  'ecc-cpp-reviewer.md',
  'ecc-csharp-reviewer.md',
  'ecc-dart-build-resolver.md',
  'ecc-database-reviewer.md',
  'ecc-django-build-resolver.md',
  'ecc-django-reviewer.md',
  'ecc-doc-updater.md',
  'ecc-docs-lookup.md',
  'ecc-e2e-runner.md',
  'ecc-fastapi-reviewer.md',
  'ecc-flutter-reviewer.md',
  'ecc-fsharp-reviewer.md',
  'ecc-gan-evaluator.md',
  'ecc-gan-generator.md',
  'ecc-gan-planner.md',
  'ecc-go-build-resolver.md',
  'ecc-go-reviewer.md',
  'ecc-homelab-architect.md',
  'ecc-harmonyos-app-resolver.md',
  'ecc-harness-optimizer.md',
  'ecc-healthcare-reviewer.md',
  'ecc-java-build-resolver.md',
  'ecc-java-reviewer.md',
  'ecc-kotlin-build-resolver.md',
  'ecc-kotlin-reviewer.md',
  'ecc-loop-operator.md',
  'ecc-marketing-agent.md',
  'ecc-mle-reviewer.md',
  'ecc-performance-optimizer.md',
  'ecc-planner.md',
  'ecc-pr-test-analyzer.md',
  'ecc-python-reviewer.md',
  'ecc-pytorch-build-resolver.md',
  'ecc-react-build-resolver.md',
  'ecc-react-reviewer.md',
  'ecc-refactor-cleaner.md',
  'ecc-rust-build-resolver.md',
  'ecc-rust-reviewer.md',
  'ecc-seo-specialist.md',
  'ecc-silent-failure-hunter.md',
  'ecc-swift-build-resolver.md',
  'ecc-swift-reviewer.md',
  'ecc-tdd-guide.md',
  'ecc-type-design-analyzer.md',
  'ecc-typescript-reviewer.md',
];

test('legacy agent wrappers are removed after their knowledge moves to workflows and skills', async () => {
  const present = new Set(await readdir(AGENT_ROOT));
  for (const file of REMOVED_AGENT_FILES) {
    assert.equal(present.has(file), false, `legacy wrapper still packaged: ${file}`);
  }
});

test('ordinary code planning stays with plugin plan while implementation and review use native agents', async () => {
  const plan = await readFile(path.join(AGENT_ROOT, 'plan.md'), 'utf8');
  assert.doesNotMatch(plan, /^spawns:\s*["']?\*["']?\s*$/m);
  assert.match(plan, /^spawns:\s*\[\]\s*$/m);
  assert.match(plan, /^name:\s*plan$/m);
  assert.match(plan, /Search local truth[\s\S]*entry points, callers, consumers, tests, configuration/i);
  assert.match(plan, /official documentation[\s\S]*community issues, discussions, postmortems/i);
  assert.match(plan, /PLAN REVIEW[\s\S]*exact RED\/GREEN commands/i);
  assert.match(plan, /parallel waves[\s\S]*vertical slices[\s\S]*non-overlapping write sets/i);
  assert.match(plan, /native `task` assignments?[\s\S]*test mutation[\s\S]*RED[\s\S]*GREEN[\s\S]*refactor/i);
  assert.match(plan, /dependencies[\s\S]*later wave/i);
  assert.match(plan, /operate as read-only/i);
  const planTools = frontmatterList(plan, 'tools');
  assert.equal(planTools.includes('edit'), false);
  assert.equal(planTools.includes('write'), false);

  for (const file of [
    'ecc-security-reviewer.md',
    'ecc-network-config-reviewer.md',
    'ecc-opensource-sanitizer.md',
  ]) {
    const source = await readFile(path.join(AGENT_ROOT, file), 'utf8');
    const tools = frontmatterList(source, 'tools');
    assert.equal(tools.includes('edit'), false, `${file} must not edit`);
    assert.equal(tools.includes('write'), false, `${file} must not write`);
  }
});

test('OMP native agent identities are not packaged by omp-config', async () => {
  const present = new Set(await readdir(AGENT_ROOT));
  for (const file of ['scout.md', 'task.md', 'sonic.md', 'designer.md', 'librarian.md', 'reviewer.md']) {
    assert.equal(present.has(file), false, `OMP native agent is shadowed by plugin asset: ${file}`);
  }
});

test('task implementation is native and never reintroduced as a plugin wrapper', async () => {
  const present = new Set(await readdir(AGENT_ROOT));
  assert.equal(present.has('task.md'), false);
  assert.equal(present.has('implementation-task.md'), false);
  assert.equal(present.has('quick_task.md'), false);
});

test('removed native-agent specialization remains available through skills', async () => {
  const [frontend, canvas, beamer, svg, documentation] = await Promise.all([
    readFile(path.join(SKILL_ROOT, 'frontend-design', 'SKILL.md'), 'utf8'),
    readFile(path.join(SKILL_ROOT, 'canvas-design', 'SKILL.md'), 'utf8'),
    readFile(path.join(SKILL_ROOT, 'latex-beamer-slides', 'SKILL.md'), 'utf8'),
    readFile(path.join(SKILL_ROOT, 'svg-flowchart', 'SKILL.md'), 'utf8'),
    readFile(path.join(SKILL_ROOT, 'ecc', 'documentation-lookup', 'SKILL.md'), 'utf8'),
  ]);

  assert.match(frontend, /design tokens.+shared primitives/is);
  assert.match(frontend, /loading, empty, error, disabled, hover, and focus/i);
  assert.match(frontend, /responsive/i);
  assert.match(canvas, /visual hierarchy/i);
  assert.match(canvas, /generic AI/i);
  assert.match(beamer, /overlap, crowding, clipping, undersized text/is);
  assert.match(beamer, /Do not split, add, remove, or reorder frames without explicit user authorization/i);
  assert.match(svg, /black.+white.+fill="none"/is);
  assert.match(documentation, /local installed source/i);
  assert.match(documentation, /types?\s*\+\s*implementation|implementation\s*\+\s*tests?/i);
  assert.match(documentation, /exact signature/i);
});

test('packaged top-level agents never use wildcard or dangling spawn targets', async () => {
  const files = (await readdir(AGENT_ROOT)).filter((file) => file.endsWith('.md'));
  const names = new Set(files.map((file) => path.basename(file, '.md')));
  for (const file of files) {
    const source = await readFile(path.join(AGENT_ROOT, file), 'utf8');
    assert.doesNotMatch(source, /^spawns:\s*["']?\*["']?\s*$/m, file);
    for (const target of frontmatterList(source, 'spawns')) {
      assert.ok(names.has(target), `${file} spawns missing agent ${target}`);
    }
  }
});

test('open-source pipeline uses exact OMP roles and returns sanitizer evidence inline', async () => {
  const skill = await readFile(path.join(SKILL_ROOT, 'ecc', 'opensource-pipeline', 'SKILL.md'), 'utf8');
  assert.match(skill, /ecc-opensource-forker/);
  assert.match(skill, /ecc-opensource-sanitizer/);
  assert.match(skill, /ecc-opensource-packager/);
  assert.doesNotMatch(skill, /\bAgent\s*\(/);
  assert.doesNotMatch(skill, /maximum 3 retry attempts|最多三次|maximum of 3/i);
  assert.doesNotMatch(skill, /gh repo create[^\n]*--push/);

  const sanitizer = await readFile(path.join(AGENT_ROOT, 'ecc-opensource-sanitizer.md'), 'utf8');
  assert.doesNotMatch(sanitizer, /Generate `SANITIZATION_REPORT\.md`|Generate SANITIZATION_REPORT\.md/i);
  assert.match(sanitizer, /return.*sanitization/i);

  const forker = await readFile(path.join(AGENT_ROOT, 'ecc-opensource-forker.md'), 'utf8');
  assert.match(forker, /source (?:directory )?(?:is|remains) read-only/i);
  assert.match(forker, /reject.*(?:same as|inside|ancestor)/i);
  assert.doesNotMatch(forker, /git\s+(?:init|commit|push)|gh\s+repo/i);

  const packager = await readFile(path.join(AGENT_ROOT, 'ecc-opensource-packager.md'), 'utf8');
  assert.match(packager, /write only.*staging/i);
  assert.match(packager, /do not (?:run|execute).*setup/i);
  assert.doesNotMatch(packager, /git\s+(?:init|commit|push)|gh\s+repo/i);
});

test('new skill wrappers exist only for knowledge gaps not already covered by inventory', async () => {
  for (const skill of [
    'build-toolchain-diagnostics',
    'code-documentation',
    'fsharp-patterns',
    'harmonyos-patterns',
    'swift-patterns',
    'type-design-review',
    'typescript-patterns',
  ]) {
    const source = await readFile(path.join(SKILL_ROOT, 'ecc', skill, 'SKILL.md'), 'utf8');
    assert.match(source, new RegExp(`^name:\\s*${skill}$`, 'm'));
    assert.doesNotMatch(source, /\[TODO:|TODO:/);
  }
});

test('active skills do not instruct Main to call deleted agent identities', async () => {
  const forbidden = REMOVED_AGENT_FILES
    .map((file) => path.basename(file, '.md'))
    .filter((id) => id.startsWith('ecc-'));
  const staleBareIds = [
    'code-reviewer',
    'doc-updater',
    'fastapi-reviewer',
    'healthcare-reviewer',
    'mle-reviewer',
    'network-troubleshooter',
    'performance-optimizer',
    'pr-test-analyzer',
    'pytorch-build-resolver',
    'react-build-resolver',
    'react-reviewer',
    'seo-specialist',
    'silent-failure-hunter',
    'tdd-guide',
  ];

  for (const file of await findSkillFiles(SKILL_ROOT)) {
    const source = await readFile(file, 'utf8');
    for (const id of forbidden) {
      assert.equal(source.includes(id), false, `${path.relative(SKILL_ROOT, file)} references ${id}`);
    }
    for (const id of staleBareIds) {
      const pattern = new RegExp(`(?<![a-z0-9-])${id}(?![a-z0-9-])`, 'i');
      assert.doesNotMatch(source, pattern, `${path.relative(SKILL_ROOT, file)} references ${id}`);
    }
  }
});

function frontmatterList(source, key) {
  const frontmatter = source.match(/^---\s*$([\s\S]*?)^---\s*$/m)?.[1] ?? '';
  const block = frontmatter.match(new RegExp(`^${key}:\\s*$([\\s\\S]*?)(?=^[a-zA-Z][\\w-]*:|\\Z)`, 'm'))?.[1] ?? '';
  return [...block.matchAll(/^\s*-\s+([^\s#]+)\s*$/gm)].map((match) => match[1]);
}

async function findSkillFiles(root) {
  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...await findSkillFiles(target));
    else if (entry.name === 'SKILL.md') results.push(target);
  }
  return results;
}
