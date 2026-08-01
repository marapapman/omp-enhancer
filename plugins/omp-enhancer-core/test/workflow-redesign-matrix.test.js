import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workflowCatalog, workflowDefinitions, workflowIds } from '../src/workflows/catalog.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testDir, '..', '..', '..');

const EXPECTED_CONTRACTS = {
  code: {
    roles: ['analyzer', 'task', 'reviewer', 'scout', 'librarian'],
    skills: ['code-development'],
  },
  writing: {
    roles: ['writer', 'zh-writer', 'checker', 'zh-checker', 'task'],
    skills: [
      'writing-review',
      'plain-chinese-writing',
      'writing-markdown-helper',
      'zh-writing-markdown-helper',
      'format-markdown2latex',
      'format-latex2markdown',
      'format-template-latex',
      'latex-beamer-slides',
      'slides-storyline',
      'docx',
    ],
  },
  research: {
    roles: [
      'fact-researcher-a',
      'fact-researcher-b',
      'fact-reviewer',
      'fact-cross-checker',
      'fact-planner',
      'scout',
    ],
    skills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
  },
  visual: {
    roles: ['designer', 'task', 'visioner'],
    skills: ['mermaid-diagram', 'tikz-diagram', 'svg-flowchart', 'frontend-design', 'canvas-design'],
  },
  operations: {
    roles: [
      'task',
      'reviewer',
      'scout',
      'ecc-network-architect',
      'ecc-network-config-reviewer',
      'ecc-network-troubleshooter',
      'ecc-security-reviewer',
      'ecc-opensource-sanitizer',
      'ecc-opensource-forker',
      'ecc-opensource-packager',
    ],
    skills: ['conventional-commits', 'finishing-a-development-branch'],
  },
};

test('the catalog exposes exactly five consolidated workflows with their role and skill contracts', () => {
  assert.deepEqual(workflowIds, ['code', 'writing', 'research', 'visual', 'operations']);
  assert.equal(workflowDefinitions.length, 5);

  for (const [id, contract] of Object.entries(EXPECTED_CONTRACTS)) {
    const workflow = workflowCatalog[id];
    assert.ok(workflow, `missing workflow ${id}`);
    assert.deepEqual(workflow.roles, contract.roles, id);
    for (const skill of contract.skills) {
      assert.ok(workflow.skills.includes(skill), `${id} must keep ${skill}`);
    }
  }
});

test('no definition carries the removed delegation, step, or composition fields', () => {
  for (const definition of workflowDefinitions) {
    for (const field of ['steps', 'delegation', 'delegationDefault', 'composeWith', 'qualityChecks', 'riskNotes']) {
      assert.equal(Object.hasOwn(definition, field), false, `${definition.id} must not have ${field}`);
    }
  }
});

test('the visual workflow keeps the designer -> task render -> visioner advisory chain in suggestedFlow', () => {
  const visual = workflowCatalog.visual;
  const flow = visual.suggestedFlow.join(' ');

  assert.equal(visual.roles.includes('designer'), true);
  assert.equal(visual.roles.includes('task'), true);
  assert.equal(visual.roles.includes('visioner'), true);
  assert.match(flow, /Design via designer for complex visuals, or directly for simple diagrams/iu);
  assert.match(flow, /Render and verify output via task; review via visioner for quality/iu);
  assert.match(flow, /Deliver with source files and rendered evidence/iu);
  assert.match(visual.scopeNotes.join(' '), /Default to Mermaid for academic diagrams unless explicit TikZ\/LaTeX request/iu);
});

test('the code workflow keeps TDD and analyzer delegation advisory without fixed fanout', () => {
  const code = workflowCatalog.code;
  const flow = code.suggestedFlow.join(' ');
  const scope = code.scopeNotes.join(' ');

  assert.deepEqual(code.roles, ['analyzer', 'task', 'reviewer', 'scout', 'librarian']);
  assert.match(flow, /Implement via task slices with TDD \(RED → GREEN → REFACTOR\) or direct work for simple changes/iu);
  assert.match(flow, /For complex multi-slice work, delegate analysis and planning to analyzer/iu);
  assert.match(scope, /Main chooses delegation width based on complexity; no fixed fanout or fork mandate/iu);
  assert.doesNotMatch(flow, /fixed.+fanout|required fork|automatic.+loop/i);
});

test('the writing workflow covers both languages and format overlays in one card', () => {
  const writing = workflowCatalog.writing;

  assert.match(writing.chooseWhen, /any language \(English, Chinese\) or format \(LaTeX, Markdown, Beamer, Word\)/iu);
  assert.match(writing.suggestedFlow.join(' '), /Identify target language \(zh\/en\) and format/iu);
  assert.match(writing.scopeNotes.join(' '), /zh skills for Chinese prose, en skills for English/u);
  assert.match(writing.scopeNotes.join(' '), /format overlays, not separate workflows/u);
});

test('research and operations carry ECC catalog candidates that are also direct skills', () => {
  assert.deepEqual(workflowCatalog.research.catalogSkills, ['research-ops', 'deep-research']);
  assert.deepEqual(workflowCatalog.operations.catalogSkills, [
    'security-review',
    'security-scan',
    'network-config-validation',
    'marketing-campaign',
    'seo',
  ]);
  for (const definition of workflowDefinitions) {
    for (const skill of definition.catalogSkills) {
      assert.ok(definition.skills.includes(skill), `${definition.id}: catalog skill ${skill} must be a direct skill`);
    }
  }
});

test('every catalog role is OMP-native or marketplace-packaged and every selected skill remains packaged', async () => {
  const [registeredSkills, registeredAgents] = await Promise.all([
    registeredMarketplaceSkills(repoRoot),
    registeredMarketplaceAgents(repoRoot),
  ]);
  const nativeAgents = new Set(['analyzer', 'plan', 'task', 'designer', 'librarian', 'reviewer', 'scout']);
  for (const [workflow, meta] of Object.entries(workflowCatalog)) {
    for (const skill of meta.skills) {
      assert.equal(
        registeredSkills.has(skill),
        true,
        `${workflow}: ${skill}`,
      );
    }
    for (const role of meta.roles) {
      assert.equal(
        nativeAgents.has(role) || registeredAgents.has(role),
        true,
        `${workflow}: ${role}`,
      );
    }
  }
});

async function registeredMarketplaceSkills(root) {
  const catalog = JSON.parse(await readFile(path.join(root, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const skills = new Set();
  for (const plugin of catalog.plugins ?? []) {
    const pluginRoot = path.join(root, 'plugins', plugin.source.replace(/^\.\//, ''));
    for (const skillPath of plugin.skills ?? []) {
      const skillDir = path.join(pluginRoot, skillPath.replace(/^\.\//, ''));
      const skillText = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
      const frontmatterName = skillText.match(/^---\n[\s\S]*?\nname:\s*([^\n]+)\n/m)?.[1]?.trim();
      skills.add(frontmatterName || path.basename(skillDir));
    }
  }
  return skills;
}

async function registeredMarketplaceAgents(root) {
  const catalog = JSON.parse(await readFile(path.join(root, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const agents = new Set();
  for (const plugin of catalog.plugins ?? []) {
    const agentsRoot = path.join(root, 'plugins', plugin.source.replace(/^\.\//, ''), 'agents');
    let entries = [];
    try {
      entries = await readdir(agentsRoot);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries.filter((name) => name.endsWith('.md'))) {
      const source = await readFile(path.join(agentsRoot, entry), 'utf8');
      const frontmatterName = source.match(/^---\n[\s\S]*?^name:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1]?.trim();
      agents.add(frontmatterName || entry.replace(/\.md$/, ''));
    }
  }
  return agents;
}
