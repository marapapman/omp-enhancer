import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { prepareAsset, registerAssetSource } from '../src/asset-prepare.js';

async function temporaryDirectory(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('registerAssetSource: SVG/tex source registration', () => {
  it('registers an SVG source in the asset manifest without rasterizing it', async () => {
    const projectRoot = await temporaryDirectory('tikz-svg-project-');
    const sourceDir = join(projectRoot, 'figures', 'icons');
    await mkdir(sourceDir, { recursive: true });
    const svgPath = 'figures/icons/logo.svg';
    const svgContent = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#000"/></svg>';
    await writeFile(join(projectRoot, svgPath), svgContent);

    const result = await registerAssetSource({
      projectRoot,
      relativePath: svgPath,
      nodeIds: ['node-logo'],
      sourceType: 'svg',
    }, { now: () => '2026-07-26T00:00:00.000Z' });

    assert.equal(result.ok, true);
    assert.equal(result.asset.relativePath, svgPath, 'asset keeps the project-relative source path');
    assert.equal(result.asset.sourceType, 'svg-source');
    assert.equal(result.asset.outputFormat, 'svg');
    assert.equal(result.asset.outputWidth, null);
    assert.equal(result.asset.outputHeight, null);
    assert.equal(result.asset.inputFormat, 'svg');
    assert.deepEqual(result.asset.nodeIds, ['node-logo']);
    assert.equal(result.asset.provenance[0].kind, 'imported-svg');
    assert.equal(result.asset.provenance[0].importedAt, '2026-07-26T00:00:00.000Z');

    const expectedHash = createHash('sha256').update(Buffer.from(svgContent)).digest('hex');
    assert.equal(result.asset.sha256, expectedHash);

    const manifestPath = join(projectRoot, 'figures/tikz/assets/assets.manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].relativePath, svgPath);
  });

  it('registers a tex source with copied-opentikz-tex provenance', async () => {
    const projectRoot = await temporaryDirectory('tikz-tex-project-');
    const sourceDir = join(projectRoot, 'figures', 'tex');
    await mkdir(sourceDir, { recursive: true });
    const texPath = 'figures/tex/snippet.tex';
    const texContent = '\\node[draw] (a) at (0,0) {A};';
    await writeFile(join(projectRoot, texPath), texContent);

    const result = await registerAssetSource({
      projectRoot,
      relativePath: texPath,
      nodeIds: ['tex-node'],
      sourceType: 'tex',
    }, { now: () => '2026-07-26T00:00:00.000Z' });

    assert.equal(result.ok, true);
    assert.equal(result.asset.sourceType, 'opentikz-tex');
    assert.equal(result.asset.outputFormat, 'tex');
    assert.equal(result.asset.outputWidth, null, 'tex sources have no fixed output width');
    assert.equal(result.asset.outputHeight, null, 'tex sources have no fixed output height');
    assert.equal(result.asset.provenance[0].kind, 'copied-opentikz-tex');
  });

  it('merges nodeIds when the same source is registered again with a new node', async () => {
    const projectRoot = await temporaryDirectory('tikz-svg-merge-');
    await mkdir(join(projectRoot, 'figures', 'icons'), { recursive: true });
    const svgPath = 'figures/icons/shared.svg';
    await writeFile(join(projectRoot, svgPath), '<svg/>');

    await registerAssetSource({
      projectRoot,
      relativePath: svgPath,
      nodeIds: ['n1'],
      sourceType: 'svg',
    }, { now: () => '2026-07-26T00:00:00.000Z' });

    await registerAssetSource({
      projectRoot,
      relativePath: svgPath,
      nodeIds: ['n2'],
      sourceType: 'svg',
    }, { now: () => '2026-07-26T00:00:01.000Z' });

    const manifestPath = join(projectRoot, 'figures/tikz/assets/assets.manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(manifest.assets.length, 1, 'same content-addressed source must collapse to one entry');
    assert.deepEqual(manifest.assets[0].nodeIds.sort(), ['n1', 'n2']);
  });

  it('prepareAsset delegates to registerAssetSource when sourceType is svg', async () => {
    const projectRoot = await temporaryDirectory('tikz-delegate-');
    await mkdir(join(projectRoot, 'figures', 'icons'), { recursive: true });
    const svgPath = 'figures/icons/delegated.svg';
    await writeFile(join(projectRoot, svgPath), '<svg/>');

    const result = await prepareAsset({
      projectRoot,
      relativePath: svgPath,
      nodeIds: ['delegated-node'],
      sourceType: 'svg',
    }, { now: () => '2026-07-26T00:00:00.000Z' });

    assert.equal(result.ok, true);
    assert.equal(result.asset.sourceType, 'svg-source');
  });

  it('rejects an invalid sourceType', async () => {
    const projectRoot = await temporaryDirectory('tikz-invalid-type-');
    await assert.rejects(
      () => registerAssetSource({ projectRoot, relativePath: 'a.svg', sourceType: 'png' }),
      (error) => error.code === 'INVALID_PARAMETER',
    );
  });
});