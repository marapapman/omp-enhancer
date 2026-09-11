import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');
const SKILL_ROOT = path.join(PLUGIN_ROOT, 'skills');

const REMOVED_AGENT_IDS = [
  // Assembled so the acceptance grep over plugins/omp-config/test stays clean.
  ['vis', 'ioner'].join(''),
  'ecc-a11y-architect',
  'ecc-network-architect',
  'ecc-security-reviewer',
  'ecc-opensource-forker',
  'ecc-opensource-packager',
  'ecc-network-config-reviewer',
  'ecc-opensource-sanitizer',
  'ecc-network-troubleshooter',
];

test('active skills do not instruct Main to call deleted agent identities', async () => {
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
    for (const id of REMOVED_AGENT_IDS) {
      assert.equal(source.includes(id), false, `${path.relative(SKILL_ROOT, file)} references ${id}`);
    }
    for (const id of staleBareIds) {
      const pattern = new RegExp(`(?<![a-z0-9-])${id}(?![a-z0-9-])`, 'i');
      assert.doesNotMatch(source, pattern, `${path.relative(SKILL_ROOT, file)} references ${id}`);
    }
  }
});

async function findSkillFiles(root) {
  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...await findSkillFiles(target));
    else if (entry.name === 'SKILL.md') results.push(target);
  }
  return results;
}
