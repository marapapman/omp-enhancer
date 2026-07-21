import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendorContainer = join(pluginRoot, 'vendor');
const vendorRoot = join(vendorContainer, 'opentikz');
const skillRoot = join(pluginRoot, 'skills', 'tikz-diagram');
const lockPath = join(vendorRoot, 'UPSTREAM_LOCK.json');
const expectedCommit = '359befbf8e8af7ce08e7e387b2c2a198e0ca735d';
const expectedImportedPaths = [
  'LICENSE-CODE',
  'LICENSE-CONTENT',
  'catalog.json',
  'examples',
  'icons',
  'icons/brands/README.md',
  'meta.schema.json',
  'reference',
  'requirements.txt',
  'templates',
  'tools/_common.py',
  'tools/build_catalog.py',
  'tools/render_preview.py',
  'tools/validate.py',
];

function read(relativePath) {
  return readFileSync(join(pluginRoot, relativePath), 'utf8');
}

function walk(root) {
  const entries = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      entries.push(path);
      if (entry.isDirectory()) visit(path);
    }
  };
  visit(root);
  return entries;
}

function posixRelative(root, path) {
  return relative(root, path).split(sep).join('/');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isInside(root, candidate) {
  const offset = relative(root, candidate);
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset));
}

function resolveSkillUri(uri) {
  const prefix = 'skill://tikz-diagram/';
  assert.ok(uri.startsWith(prefix), `unexpected Skill URI: ${uri}`);
  const target = resolve(skillRoot, uri.slice(prefix.length));
  assert.ok(isInside(skillRoot, target), `Skill URI escapes its root: ${uri}`);
  return target;
}

test('OpenTikZ lock pins the reviewed upstream snapshot and import boundary', () => {
  assert.ok(existsSync(lockPath), 'vendor/UPSTREAM_LOCK.json must exist');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

  assert.equal(lock.schemaVersion, 1);
  assert.equal(lock.repository, 'https://github.com/opentikz/opentikz');
  assert.equal(lock.commit, expectedCommit);
  assert.equal(lock.snapshotLabel, 'opentikz-2026-07-21-359befbf8e8a');
  assert.deepEqual(lock.importedPaths, expectedImportedPaths);
  assert.match(lock.inventoryAlgorithm, /SHA-256.+binary bytes.+POSIX.+lexicographic.+UPSTREAM_LOCK\.json excluded/is);
  assert.ok(lock.exclusions.includes('.git/'));
  assert.ok(lock.exclusions.includes('site/'));
  assert.ok(lock.exclusions.includes('tools/build_site.py'));
});

test('vendored files have no links or package artifacts and match the deterministic SHA-256 inventory', () => {
  assert.deepEqual(readdirSync(vendorContainer), ['opentikz']);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const paths = walk(vendorRoot);
  const symlinks = paths.filter((path) => lstatSync(path).isSymbolicLink());
  assert.deepEqual(symlinks, [], 'vendored snapshots must not contain symlinks');

  const relativePaths = paths.map((path) => posixRelative(vendorRoot, path));
  const forbidden = relativePaths.filter((path) => (
    /(^|\/)(?:\.git|site|node_modules|__pycache__)(?:\/|$)/u.test(path)
    || path === 'tools/build_site.py'
    || path === 'templates/.gitkeep'
  ));
  assert.deepEqual(forbidden, [], `forbidden vendor artifacts:\n${forbidden.join('\n')}`);

  const actualTopLevel = readdirSync(vendorRoot).sort();
  assert.deepEqual(actualTopLevel, [
    'LICENSE-CODE',
    'LICENSE-CONTENT',
    'UPSTREAM_LOCK.json',
    'catalog.json',
    'examples',
    'icons',
    'meta.schema.json',
    'reference',
    'requirements.txt',
    'templates',
    'tools',
  ]);

  const actualInventory = paths
    .filter((path) => lstatSync(path).isFile() && path !== lockPath)
    .map((path) => ({ path: posixRelative(vendorRoot, path), sha256: sha256(path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  assert.equal(actualInventory.length, 238);
  assert.deepEqual(lock.files, actualInventory);
  assert.ok(lock.files.every((entry) => /^[a-f0-9]{64}$/u.test(entry.sha256)));
});

test('catalog paths resolve to the complete pinned icon, template, and example set', () => {
  const catalog = JSON.parse(readFileSync(join(vendorRoot, 'catalog.json'), 'utf8'));
  assert.equal(catalog.length, 73);
  assert.deepEqual(
    Object.fromEntries(['example', 'icon', 'template'].map((type) => [
      type,
      catalog.filter((entry) => entry.type === type).length,
    ])),
    { example: 3, icon: 61, template: 9 },
  );
  assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length);
  assert.equal(new Set(catalog.map((entry) => entry.path)).size, catalog.length);

  for (const entry of catalog) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(!isAbsolute(entry.path) && !entry.path.split('/').includes('..'), entry.path);
    const itemRoot = resolve(vendorRoot, entry.path);
    assert.ok(isInside(vendorRoot, itemRoot) && lstatSync(itemRoot).isDirectory(), entry.path);
    assert.ok(existsSync(resolve(itemRoot, entry.preview)), `${entry.id}: missing preview`);

    const itemFiles = readdirSync(itemRoot);
    const metaFiles = itemFiles.filter((name) => name.endsWith('.meta.json'));
    const texFiles = itemFiles.filter((name) => name.endsWith('.tex'));
    assert.equal(metaFiles.length, 1, `${entry.id}: expected one metadata file`);
    assert.equal(texFiles.length, 1, `${entry.id}: expected one TikZ source`);
    const metadata = JSON.parse(readFileSync(join(itemRoot, metaFiles[0]), 'utf8'));
    assert.equal(metadata.id, entry.id, `${entry.id}: catalog/metadata mismatch`);
    assert.match(readFileSync(join(itemRoot, texFiles[0]), 'utf8'), /\\documentclass(?:\[[^\]]*\])?\{standalone\}/u);
  }

  const flowchart = catalog.find((entry) => entry.id === 'flowchart');
  assert.equal(flowchart?.path, 'templates/flowchart');
  assert.match(flowchart?.edit_contract?.node_naming ?? '', /semantic node names/i);
  assert.ok(flowchart?.edit_contract?.invariants?.some((value) => /decision.+outgoing edges/i.test(value)));
});

test('licenses, brand notice, schema, and local-only upstream tools remain present', () => {
  assert.match(read('vendor/opentikz/LICENSE-CODE'), /^MIT License/mu);
  assert.match(read('vendor/opentikz/LICENSE-CONTENT'), /CC0 1\.0 Universal/u);
  assert.match(read('vendor/opentikz/icons/brands/README.md'), /trademark of its owner.+does not\s+imply endorsement/is);
  assert.match(read('vendor/opentikz/icons/brands/README.md'), /current.+simple-icons.+do not resurrect/is);
  assert.equal(read('vendor/opentikz/requirements.txt').trim().split('\n').at(-1), 'jsonschema>=4.20,<5');

  const schema = JSON.parse(read('vendor/opentikz/meta.schema.json'));
  assert.equal(schema.title, 'OpenTikZ item metadata');
  assert.deepEqual(readdirSync(join(vendorRoot, 'tools')).sort(), [
    '_common.py',
    'build_catalog.py',
    'render_preview.py',
    'validate.py',
  ]);

  const toolSource = readdirSync(join(vendorRoot, 'tools'))
    .map((name) => readFileSync(join(vendorRoot, 'tools', name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(
    toolSource,
    /(?:\brequests\b|\burllib\b|\bhttpx\b|\baiohttp\b|\bsocket\.|\bfetch\s*\(|\bcurl\b|\bwget\b)/iu,
    'vendored tooling must not contain runtime network clients or download commands',
  );
});

test('tikz-diagram has concise frontmatter and all exact one-level reference URIs resolve', () => {
  const skill = read('skills/tikz-diagram/SKILL.md');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1];
  assert.ok(frontmatter, 'Skill frontmatter is required');
  const keys = [...frontmatter.matchAll(/^([A-Za-z0-9_-]+):/gmu)].map((match) => match[1]);
  assert.deepEqual(keys, ['name', 'description']);
  assert.match(frontmatter, /^name: tikz-diagram$/mu);
  assert.doesNotMatch(frontmatter, /\[TODO|TODO:/u);

  const expectedUris = [
    'skill://tikz-diagram/references/opentikz-contract.md',
    'skill://tikz-diagram/references/flowchart-semantics.md',
    'skill://tikz-diagram/references/imagegen-assets.md',
    'skill://tikz-diagram/references/render-review.md',
  ];
  const uris = [...skill.matchAll(/skill:\/\/tikz-diagram\/[A-Za-z0-9._/-]+\.md/gu)]
    .map((match) => match[0]);
  assert.deepEqual([...new Set(uris)].sort(), expectedUris.sort());
  for (const uri of expectedUris) {
    const target = resolveSkillUri(uri);
    assert.ok(existsSync(target) && lstatSync(target).isFile(), `unresolved ${uri}`);
    assert.equal(posixRelative(skillRoot, target).split('/').length, 2, `${uri} must be one level under references/`);
  }

  const ui = read('skills/tikz-diagram/agents/openai.yaml');
  assert.match(ui, /default_prompt: "[^"]*\$tikz-diagram[^"]*"/u);
  assert.doesNotMatch(ui, /^\s*dependencies:/mu);
});

test('linked TikZ resources use one byte-zero extension handoff before the final workflow reference', () => {
  const skill = read('skills/tikz-diagram/SKILL.md');
  const marker = 'RESOURCE EXTENSION | source=skill://tikz-diagram | reads=<applicable-exact-linked-URIs-in-listed-order>';

  assert.equal(skill.split(marker).length - 1, 1, 'the exact linked-resource marker template must appear once');
  assert.match(
    skill,
    /next linked-resource response.+start(?:s)? at byte 0.+RESOURCE EXTENSION \| source=skill:\/\/tikz-diagram \| reads=<applicable-exact-linked-URIs-in-listed-order>/is,
  );
  assert.match(
    skill,
    /same response.+read exactly.+applicable.+URI.+listed order.+end and wait.+before THEN/is,
  );
  assert.match(skill, /at most one linked-method batch.+never reread/is);
  assert.match(
    skill,
    /marker.+before.+resource reads.+never.+after.+reads.+never.+final workflow reference/is,
  );
  assert.doesNotMatch(
    skill,
    /block:\s*true|continue:\s*true|retry until|repeat until|hard (?:gate|router)|completion authority/is,
  );
});

test('Skill and references preserve host authority, copy safety, imagegen boundaries, and soft review', () => {
  const skill = read('skills/tikz-diagram/SKILL.md');
  const references = readdirSync(join(skillRoot, 'references'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => readFileSync(join(skillRoot, 'references', name), 'utf8'))
    .join('\n');
  const contract = `${skill}\n${references}`;

  assert.match(contract, /vendor.+read-only/is);
  assert.match(contract, /copy.+before.+edit/is);
  assert.match(contract, /never edit.+vendor/is);
  assert.match(contract, /catalog search.+unavailable.+(?:code-native|project-native|plain TikZ).+fallback/is);
  assert.match(contract, /returned `sourcePath`.+never infer.+filename/is);
  assert.match(contract, /template.+node IDs.+semantic (?:mapping|spec)/is);
  assert.match(contract, /prefer.+vector.+icon/is);
  assert.match(contract, /`generate_image`.+optional/is);
  assert.match(contract, /native imagegen.+`generate_image`/is);
  assert.match(contract, /Main.+(?:choose|decide|own).+`generate_image`/is);
  assert.match(contract, /(?:never|do not).+`generate_image`.+(?:topology|edges|arrows).+(?:labels|text)/is);
  assert.match(contract, /raster.+never.+(?:call|claim|describe).+vector/is);
  assert.match(contract, /host.+authoritative/is);
  assert.match(contract, /`designer`.+soft.+(?:candidate|delegation)/is);
  assert.match(contract, /`visioner`.+read-only/is);
  assert.match(contract, /never probe or guess.+Agent URI.+inventory/is);
  assert.match(contract, /once per top-level Main task.+not.+(?:gate|block)/is);
  assert.match(contract, /group.+findings.+bounded revision|split.+findings.+bounded revisions/is);
  assert.match(contract, /no.+(?:gate|completion permission|automatic loop)/is);
  assert.doesNotMatch(contract, /block:\s*true|continue:\s*true|retry until|repeat until|must delegate|mandatory fork/i);
});

test('selected TikZ work compiles designer, Main render, and visioner in dependency order with explicit evidence gaps', () => {
  const skill = read('skills/tikz-diagram/SKILL.md');
  const designDoc = readFileSync(resolve(pluginRoot, '../../docs/TIKZ_PLUGIN.md'), 'utf8');

  const designerCheckpoint = skill.indexOf('1. **Designer checkpoint**');
  const mainRender = skill.indexOf('2. **Main integration and render**');
  const visionerCheckpoint = skill.indexOf('3. **Visioner checkpoint**');
  assert.ok(designerCheckpoint >= 0, 'the normal compiled chain must name the designer checkpoint');
  assert.ok(mainRender > designerCheckpoint, 'Main integration/render must follow designer delivery');
  assert.ok(visionerCheckpoint > mainRender, 'visioner review must follow fresh Main rendering');

  assert.match(
    skill,
    /selected non-simple `diagram\.tikz`.+normal compiled dependency chain.+`designer`.+Main.+`visioner`/is,
  );
  assert.match(
    skill,
    /`designer` owns.+complete.+design.+source revision checkpoint/is,
  );
  assert.match(
    skill,
    /Main.+integrates.+designer delivery.+exact current revision.+`tikz_render`.+full-size.+60%/is,
  );
  assert.match(
    skill,
    /`visioner`.+independently.+read-only.+layout.+legibility.+fresh.+current-revision/is,
  );
  assert.match(
    skill,
    /designer.+unavailable.+TODO.+unfulfilled designer checkpoint.+Agent-availability fallback.+Main.+cannot claim designer evidence/is,
  );
  assert.match(
    skill,
    /visioner.+unavailable.+missing independent current-revision visual evidence.+compile.+source.+static checks.+designer.+Main self-review.+do not replace/is,
  );
  assert.doesNotMatch(
    skill,
    /mandatory runtime fork|fixed fanout|automatic retry|hard (?:gate|router)|completion authority/is,
  );

  assert.match(
    designDoc,
    /non-simple visual workflows.+`designer`.+complete design.+`visioner`.+fresh current-revision render/is,
  );
  assert.match(
    designDoc,
    /designer (?:is )?unavailable.+unfulfilled checkpoint.+Agent-availability fallback.+visioner (?:is )?unavailable.+missing independent current-revision visual evidence/is,
  );
});
