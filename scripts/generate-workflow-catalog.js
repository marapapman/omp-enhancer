import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildSharedWorkflowCatalogMarkdown } from '../plugins/omp-enhancer-core/src/workflows/render-shared-markdown.js';
import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferences,
} from '../plugins/omp-enhancer-core/src/workflows/render-skill.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const workflowCatalogTarget = path.join(
  repoRoot,
  'plugins',
  'omp-config',
  'assets',
  'WORKFLOW_CATALOG.md',
);

export const workflowSkillRoot = path.join(
  repoRoot,
  'plugins',
  'omp-config',
  'skills',
  'omp-enhancer-workflows',
);

export async function checkWorkflowArtifacts({
  catalogTarget = workflowCatalogTarget,
  skillRoot = workflowSkillRoot,
} = {}) {
  const expected = workflowArtifacts({ catalogTarget, skillRoot });
  const results = await Promise.all(expected.map(async (artifact) => {
    const actual = await readFile(artifact.target, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    return { ...artifact, actual, ok: actual === artifact.expected };
  }));
  const unexpected = await unexpectedWorkflowReferences(skillRoot, expected);
  results.push(...unexpected.map((target) => ({
    target,
    expected: null,
    actual: null,
    ok: false,
    unexpected: true,
  })));
  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

export async function writeWorkflowArtifacts({
  catalogTarget = workflowCatalogTarget,
  skillRoot = workflowSkillRoot,
} = {}) {
  const artifacts = workflowArtifacts({ catalogTarget, skillRoot });
  const removed = await unexpectedWorkflowReferences(skillRoot, artifacts);
  await Promise.all(removed.map((target) => unlink(target)));
  for (const artifact of artifacts) {
    await mkdir(path.dirname(artifact.target), { recursive: true });
    await writeFile(artifact.target, artifact.expected, 'utf8');
  }
  return {
    ok: true,
    results: artifacts.map((artifact) => ({
      target: artifact.target,
      bytes: Buffer.byteLength(artifact.expected),
    })),
    removed,
  };
}

async function unexpectedWorkflowReferences(skillRoot, artifacts) {
  const referencesRoot = path.join(skillRoot, 'references');
  const entries = await readdir(referencesRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const expectedTargets = new Set(artifacts.map(({ target }) => path.resolve(target)));
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(referencesRoot, entry.name))
    .filter((target) => !expectedTargets.has(path.resolve(target)))
    .sort();
}

function workflowArtifacts({ catalogTarget, skillRoot }) {
  const references = buildWorkflowSkillReferences();
  return [
    { target: catalogTarget, expected: buildSharedWorkflowCatalogMarkdown() },
    { target: path.join(skillRoot, 'SKILL.md'), expected: buildWorkflowSkillIndexMarkdown() },
    ...Object.entries(references).map(([workflowId, expected]) => ({
      target: path.join(skillRoot, 'references', `${workflowId}.md`),
      expected,
    })),
  ];
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: node scripts/generate-workflow-catalog.js --check|--write\n');
    return;
  }
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  if (check === write || argv.some((arg) => !['--check', '--write'].includes(arg))) {
    throw new Error('Choose exactly one mode: --check or --write.');
  }

  if (write) {
    const result = await writeWorkflowArtifacts();
    for (const target of result.removed) {
      process.stdout.write(`Removed ${path.relative(repoRoot, target)}.\n`);
    }
    for (const artifact of result.results) {
      process.stdout.write(`Generated ${path.relative(repoRoot, artifact.target)} (${artifact.bytes} bytes).\n`);
    }
    return;
  }

  const result = await checkWorkflowArtifacts();
  if (!result.ok) {
    for (const artifact of result.results.filter((entry) => !entry.ok)) {
      process.stderr.write(`Workflow artifact is stale: ${path.relative(repoRoot, artifact.target)}.\n`);
    }
    process.stderr.write('Run npm run generate:workflows.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Workflow artifacts are current (${result.results.length} files).\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
