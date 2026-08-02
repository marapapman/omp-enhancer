import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pipelineDocPath = resolve(pluginRoot, '../../docs/MERMAID_PIPELINE.md');
const pipelineDoc = readFileSync(pipelineDocPath, 'utf8');
const readme = readFileSync(join(pluginRoot, 'README.md'), 'utf8');

test('README.md embeds the code-first Mermaid contract phrases', () => {
  assert.match(readme, /Mermaid source is the sole source of node positions and edge geometry/i);
  assert.match(readme, /never hand-edit(?:s|ing)? SVG coordinates/i);
  assert.match(readme, /revision-bound SVG/i);
  assert.match(readme, /mermaid_render/i);
  assert.match(readme, /htmlLabels: false/i);
  assert.match(readme, /MERMAID_NOT_INSTALLED/i);
  assert.doesNotMatch(readme, /tikz|TikZ/i);
});

test('README.md preserves the designer one-pass and Main check ownership paragraph', () => {
  assert.match(
    readme,
    /`designer`.+authors the Mermaid source in one pass.+`mermaid_render`.+Main performs a simple check/is,
  );
});

test('README.md preserves the designer-unavailable evidence-gap paragraph', () => {
  assert.match(
    readme,
    /Agent is unavailable.+records the unfulfilled design checkpoint/is,
  );
  assert.doesNotMatch(readme, /visioner/i);
});

test('docs/MERMAID_PIPELINE.md is referenced from README.md', () => {
  assert.match(readme, /docs\/MERMAID_PIPELINE\.md/);
});

test('docs/MERMAID_PIPELINE.md documents the tool surface, artifact contract, and error codes', () => {
  assert.match(pipelineDoc, /mermaid_render/);
  assert.match(pipelineDoc, /Tool surface/i);
  assert.match(pipelineDoc, /Artifact contract/i);
  assert.match(pipelineDoc, /MERMAID_NOT_INSTALLED/);
  assert.match(pipelineDoc, /CHROME_NOT_FOUND/);
  assert.doesNotMatch(pipelineDoc, /tikz|TikZ/i);
});
