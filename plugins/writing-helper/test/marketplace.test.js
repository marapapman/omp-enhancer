import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readText(path) {
  return readFile(path, 'utf8');
}

describe('marketplace install metadata', () => {
  it('publishes writing-helper through the root omp-enhancer marketplace', async () => {
    const root = process.cwd();
    const packageJson = await readJson(join(root, 'package.json'));
    const catalog = await readJson(join(root, '..', '..', '.omp-plugin', 'marketplace.json'));
    const previousCatalog = await readJson(join(root, 'docs', 'previous-marketplace.json'));
    const plugin = catalog.plugins.find((candidate) => candidate.name === packageJson.name);

    assert.equal(catalog.name, 'omp-enhancer');
    assert.equal(catalog.owner.name, 'marapapman');
    assert.ok(plugin, 'root marketplace catalog should contain the package plugin');
    assert.equal(plugin.version, packageJson.version);
    assert.equal(plugin.category, 'writing');
    assert.equal(plugin.homepage, 'https://github.com/marapapman/omp-enhancer/tree/main/plugins/writing-helper');
    assert.equal(plugin.repository, 'https://github.com/marapapman/omp-enhancer');
    assert.equal(plugin.source, './writing-helper');
    assert.deepEqual(plugin.skills, await bundledSkillPaths(root));
    assert.equal(previousCatalog.name, 'omp-writing-helper');
  });

  it('ships all files needed by marketplace and package installs', async () => {
    const packageJson = await readJson(join(process.cwd(), 'package.json'));

    assert.deepEqual(packageJson.omp.extensions, ['./index.js']);
    assert.deepEqual(packageJson.files, [
      'index.js',
      'src',
      'agents',
      'skills',
      'package.json',
      'README.md',
    ]);
  });

  it('declares Pi skill roots for bundled writing skills', async () => {
    const packageJson = await readJson(join(process.cwd(), 'package.json'));

    assert.ok(packageJson.keywords.includes('pi-package'));
    assert.deepEqual(packageJson.pi.skills, ['./skills']);
  });

  it('documents marketplace install and upgrade commands', async () => {
    const readme = await readText(join(process.cwd(), 'README.md'));

    assert.match(readme, /omp plugin marketplace add marapapman\/omp-enhancer/);
    assert.match(readme, /omp plugin install writing-helper@omp-enhancer/);
    assert.match(readme, /omp plugin marketplace update omp-enhancer/);
    assert.match(readme, /omp plugin upgrade writing-helper@omp-enhancer/);
    assert.match(readme, /omp plugin link --dry-run --json \/absolute\/path\/to\/omp-enhancer\/plugins\/writing-helper/);
    assert.match(readme, /npm run coverage --workspace writing-helper/);
    assert.match(readme, /npm pack --dry-run --workspace plugins\/writing-helper/);
  });

  it('keeps writing workflows direct by default and free of invented slash commands', async () => {
    const root = process.cwd();
    const files = [
      'skills/writing-markdown-helper/SKILL.md',
      'skills/zh-writing-markdown-helper/SKILL.md',
      'skills/writing-review/SKILL.md',
      'skills/zh-writing-review/SKILL.md',
      'skills/writing-state-machine/SKILL.md',
      'skills/zh-writing-state-machine/SKILL.md',
    ];
    for (const relative of files) {
      const content = await readText(join(root, relative));
      assert.doesNotMatch(content, /\/skill:/, relative);
    }
    assert.match(await readText(join(root, 'skills/writing-review/SKILL.md')), /Default One-Pass Workflow/);
    assert.match(await readText(join(root, 'skills/zh-writing-review/SKILL.md')), /默认单轮流程/);
  });

});

async function bundledSkillPaths(root) {
  const entries = await readdir(join(root, 'skills'), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => `./skills/${entry.name}`)
    .sort();
}
