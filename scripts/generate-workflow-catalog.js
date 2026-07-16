import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildSharedWorkflowCatalogMarkdown,
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferences,
} from '../plugins/omp-enhancer-core/src/workflow-routes.js';

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

export async function checkWorkflowCatalog(target = workflowCatalogTarget) {
  const expected = buildSharedWorkflowCatalogMarkdown();
  const actual = await readFile(target, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  return {
    ok: actual === expected,
    target,
    expected,
    actual,
  };
}

export async function writeWorkflowCatalog(target = workflowCatalogTarget) {
  const content = buildSharedWorkflowCatalogMarkdown();
  await writeFile(target, content, 'utf8');
  return { ok: true, target, bytes: Buffer.byteLength(content) };
}

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
  };
}

function workflowArtifacts({ catalogTarget, skillRoot }) {
  const references = buildWorkflowSkillReferences();
  return [
    { target: catalogTarget, expected: buildSharedWorkflowCatalogMarkdown() },
    { target: path.join(skillRoot, 'SKILL.md'), expected: buildWorkflowSkillIndexMarkdown() },
    ...Object.entries(references).map(([domain, expected]) => ({
      target: path.join(skillRoot, 'references', `${domain}.md`),
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
