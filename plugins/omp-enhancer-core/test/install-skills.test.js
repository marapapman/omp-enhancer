import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync, readlinkSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { installPluginSkills } from '../src/install-skills.js';

/**
 * Create a minimal marketplace catalog at <ompRoot>/plugins/cache/marketplaces/<name>/marketplace.json
 */
async function writeMarketplace(ompRoot, marketplaceName, plugins) {
  const dir = path.join(ompRoot, 'plugins', 'cache', 'marketplaces', marketplaceName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'marketplace.json'),
    JSON.stringify({ name: marketplaceName, plugins }, null, 2),
  );
}

/**
 * Create a plugin cache dir with a skill that has a SKILL.md containing frontmatter name.
 * <ompRoot>/plugins/cache/plugins/<marketplace>___<name>___<version>/skills/<skillPath>/
 */
async function createPluginSkill(ompRoot, marketplace, pluginName, version, skillPath, skillName) {
  const pluginDir = path.join(ompRoot, 'plugins', 'cache', 'plugins', `${marketplace}___${pluginName}___${version}`);
  const skillDir = path.join(pluginDir, skillPath);
  await mkdir(skillDir, { recursive: true });
  const frontmatter = `---\nname: ${skillName}\n---\n\n# ${skillName}\n\nSkill content for ${skillName}.\n`;
  await writeFile(path.join(skillDir, 'SKILL.md'), frontmatter);
  return { pluginDir, skillDir };
}

test('installPluginSkills creates symlinks for all marketplace plugin skills', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    // Set up marketplace with two plugins, each with skills
    await writeMarketplace(tmpRoot, 'omp-enhancer', [
      {
        name: 'writing-helper',
        version: '0.2.3',
        skills: [
          './skills/writing-review',
          './skills/format-humanizer',
          './skills/plain-chinese-writing',
        ],
      },
      {
        name: 'omp-fact-checker',
        version: '0.1.1',
        skills: [
          './skills/fact-checking',
          './skills/claim-extraction',
        ],
      },
    ]);

    await createPluginSkill(tmpRoot, 'omp-enhancer', 'writing-helper', '0.2.3', 'skills/writing-review', 'writing-review');
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'writing-helper', '0.2.3', 'skills/format-humanizer', 'format-humanizer');
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'writing-helper', '0.2.3', 'skills/plain-chinese-writing', 'plain-chinese-writing');
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'omp-fact-checker', '0.1.1', 'skills/fact-checking', 'fact-checking');
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'omp-fact-checker', '0.1.1', 'skills/claim-extraction', 'claim-extraction');

    const result = await installPluginSkills(opts);

    // All 5 skills installed to both targets = 10 total installs
    assert.equal(result.installed.length, 10);
    assert.equal(result.errors.length, 0);

    // Verify symlinks in skills/
    const skillsDir = path.join(tmpRoot, 'skills');
    const managedDir = path.join(tmpRoot, 'agent', 'managed-skills');

    for (const targetBase of [skillsDir, managedDir]) {
      for (const name of ['writing-review', 'format-humanizer', 'plain-chinese-writing', 'fact-checking', 'claim-extraction']) {
        const linkPath = path.join(targetBase, name);
        assert.equal(existsSync(linkPath), true, `${linkPath} should exist`);
        assert.equal(statSync(linkPath).isDirectory(), true, `${linkPath} should be a directory`);
        // Verify it's a symlink
        const target = readlinkSync(linkPath);
        assert.ok(target.includes(name), `symlink target ${target} should contain ${name}`);
        // Verify SKILL.md is readable
        const text = await readFile(path.join(linkPath, 'SKILL.md'), 'utf8');
        assert.ok(text.includes(`name: ${name}`), `${linkPath}/SKILL.md should contain name: ${name}`);
      }
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('installPluginSkills is idempotent on re-run', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    await writeMarketplace(tmpRoot, 'omp-enhancer', [
      {
        name: 'writing-helper',
        version: '0.2.3',
        skills: ['./skills/writing-review'],
      },
    ]);
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'writing-helper', '0.2.3', 'skills/writing-review', 'writing-review');

    // First run
    const first = await installPluginSkills(opts);
    assert.equal(first.installed.length, 2); // skills/ + managed-skills/

    // Second run — all should be skipped
    const second = await installPluginSkills(opts);
    assert.equal(second.installed.length, 0);
    assert.equal(second.skipped.length, 2); // both already installed
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('installPluginSkills skips real directories (non-destructive)', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    // Create a marketplace with a skill that collides with a real dir
    await writeMarketplace(tmpRoot, 'omp-enhancer', [
      {
        name: 'writing-helper',
        version: '0.2.3',
        skills: ['./skills/writing-review'],
      },
    ]);
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'writing-helper', '0.2.3', 'skills/writing-review', 'writing-review');

    // Pre-create a real directory (not a symlink) at managed-skills/writing-review
    const realDir = path.join(tmpRoot, 'agent', 'managed-skills', 'writing-review');
    await mkdir(realDir, { recursive: true });
    await writeFile(path.join(realDir, 'SKILL.md'), '---\nname: writing-review\n---\n\nUser-created skill.\n');

    const result = await installPluginSkills(opts);

    // The real dir should be skipped, the skills/ target should install
    const skippedNames = result.skipped.filter((s) => s.startsWith('writing-review'));
    assert.ok(skippedNames.length > 0, 'real writing-review dir should be skipped');

    // The real dir should still be a real dir (not replaced by a symlink)
    assert.throws(() => readlinkSync(realDir), /EINVAL|EACCES|ENOENT|not a symlink/);

    // The skills/ target should have a symlink
    const skillsLink = path.join(tmpRoot, 'skills', 'writing-review');
    assert.equal(existsSync(skillsLink), true);
    // Should be a symlink
    const target = readlinkSync(skillsLink);
    assert.ok(target.endsWith('writing-review'));
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('installPluginSkills replaces stale symlinks', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    await writeMarketplace(tmpRoot, 'omp-enhancer', [
      {
        name: 'writing-helper',
        version: '0.2.3',
        skills: ['./skills/writing-review'],
      },
    ]);
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'writing-helper', '0.2.3', 'skills/writing-review', 'writing-review');

    // Create a stale symlink pointing to a non-existent dir
    const skillsDir = path.join(tmpRoot, 'skills');
    await mkdir(skillsDir, { recursive: true });
    const staleTarget = path.join(tmpRoot, 'nonexistent');
    await symlink(staleTarget, path.join(skillsDir, 'writing-review'), 'dir');

    const result = await installPluginSkills(opts);
    // Should have replaced the symlink — 1 updated in skills/ + 1 new in managed-skills/
    assert.ok(result.installed.some((s) => s === 'writing-review (updated)'));
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('installPluginSkills dry-run does not create files', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    await writeMarketplace(tmpRoot, 'omp-enhancer', [
      {
        name: 'writing-helper',
        version: '0.2.3',
        skills: ['./skills/writing-review'],
      },
    ]);
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'writing-helper', '0.2.3', 'skills/writing-review', 'writing-review');

    const result = await installPluginSkills({ ...opts, dryRun: true });

    // Should report planned actions
    assert.equal(result.installed.length, 4); // mkdir skills + mkdir managed + 2 symlinks
    // But no actual files
    assert.equal(existsSync(path.join(tmpRoot, 'skills')), false);
    assert.equal(existsSync(path.join(tmpRoot, 'agent', 'managed-skills')), false);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('installPluginSkills handles nested skill paths (ecc/ prefix)', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    await writeMarketplace(tmpRoot, 'omp-enhancer', [
      {
        name: 'omp-config',
        version: '0.1.16',
        skills: ['./skills/ecc/security-review'],
      },
    ]);
    await createPluginSkill(tmpRoot, 'omp-enhancer', 'omp-config', '0.1.16', 'skills/ecc/security-review', 'security-review');

    const result = await installPluginSkills(opts);

    // Should install to both targets using frontmatter name "security-review"
    assert.equal(result.installed.length, 2);
    assert.equal(result.errors.length, 0);

    // Verify the skill is accessible by its frontmatter name, not the nested path
    for (const targetBase of [path.join(tmpRoot, 'skills'), path.join(tmpRoot, 'agent', 'managed-skills')]) {
      const linkPath = path.join(targetBase, 'security-review');
      assert.equal(existsSync(linkPath), true, `${linkPath} should exist`);
      const text = await readFile(path.join(linkPath, 'SKILL.md'), 'utf8');
      assert.ok(text.includes('name: security-review'));
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('installPluginSkills handles missing marketplace gracefully', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    // No marketplace written
    const result = await installPluginSkills(opts);
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('No marketplace catalogs'));
    assert.equal(result.installed.length, 0);
    assert.equal(result.errors.length, 0);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('installPluginSkills handles missing SKILL.md gracefully', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-skills-test-'));
  const opts = { ompRoot: tmpRoot };

  try {
    await writeMarketplace(tmpRoot, 'omp-enhancer', [
      {
        name: 'ghost-plugin',
        version: '1.0.0',
        skills: ['./skills/missing-skill'],
      },
    ]);

    // Create the plugin cache dir but no SKILL.md
    const pluginDir = path.join(tmpRoot, 'plugins', 'cache', 'plugins', 'omp-enhancer___ghost-plugin___1.0.0');
    await mkdir(path.join(pluginDir, 'skills', 'missing-skill'), { recursive: true });

    const result = await installPluginSkills(opts);
    // Should warn about missing SKILL.md but not crash
    assert.equal(result.installed.length, 0);
    assert.ok(result.warnings.some((w) => w.includes('SKILL.md not found')), 'should warn about missing SKILL.md');
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
