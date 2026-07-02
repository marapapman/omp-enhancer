import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const BUNDLED_DIRECTORIES = ['agents', 'skills', 'hooks'];
const BUNDLED_ASSETS = [
  'CLAUDE.md',
  'gitignore.root',
  'config.yml',
  'models.yml',
  'mcp.json',
  'env.example',
  'gitignore.agent',
];

function textContent(text) {
  return { type: 'text', text };
}

function paramsOrEmpty(params) {
  if (params && typeof params === 'object') return params;
  return {};
}

function countFiles(path) {
  if (!existsSync(path)) return 0;
  let count = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(childPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function listDirectoryNames(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() || entry.isFile())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function assetStatus() {
  return BUNDLED_ASSETS.map((name) => {
    const path = join(ROOT, 'assets', name);
    return {
      name,
      path: relative(ROOT, path),
      exists: existsSync(path),
    };
  });
}

export function runConfigAssets() {
  const directories = Object.fromEntries(
    BUNDLED_DIRECTORIES.map((name) => {
      const path = join(ROOT, name);
      return [
        name,
        {
          path: relative(ROOT, path),
          exists: existsSync(path),
          entries: listDirectoryNames(path),
          fileCount: countFiles(path),
        },
      ];
    }),
  );
  const assets = assetStatus();
  const missing = [
    ...assets.filter((asset) => !asset.exists).map((asset) => asset.path),
    ...Object.values(directories)
      .filter((directory) => !directory.exists)
      .map((directory) => directory.path),
  ];
  const report = [
    '# OMP Config Assets',
    '',
    `Assets: ${assets.filter((asset) => asset.exists).length}/${assets.length} present`,
    ...assets.map((asset) => `- ${asset.exists ? 'present' : 'missing'} ${asset.path}`),
    '',
    ...Object.entries(directories).map(
      ([name, directory]) =>
        `- ${name}: ${directory.exists ? `${directory.fileCount} files` : 'missing'} (${directory.path})`,
    ),
    '',
    'These files are packaged templates and installable content. They are not written to ~/.omp automatically.',
  ].join('\n');

  return {
    ok: missing.length === 0,
    report,
    details: { assets, directories, missing },
  };
}

export function runConfigDoctor(input = {}) {
  const assets = runConfigAssets();
  const targetPath = typeof input.targetPath === 'string' && input.targetPath.trim() !== '' ? input.targetPath : '~/.omp';
  const checks = [
    {
      name: 'packaged_assets',
      ok: assets.ok,
      message: assets.ok ? 'All packaged config templates and content directories are present.' : 'Some packaged config templates or content directories are missing.',
    },
    {
      name: 'safe_mode',
      ok: true,
      message: `Doctor inspected package metadata only and did not modify ${targetPath}.`,
    },
    {
      name: 'manual_review_required',
      ok: true,
      message: 'Review config.yml, models.yml, mcp.json, hooks, and env.example before applying them to a live OMP home.',
    },
  ];
  const risks = checks.filter((check) => !check.ok);
  const report = [
    '# OMP Config Doctor',
    '',
    `Target: ${targetPath}`,
    '',
    ...checks.map((check) => `- ${check.ok ? 'ok' : 'risk'} ${check.name}: ${check.message}`),
  ].join('\n');

  return {
    ok: risks.length === 0,
    report,
    details: { targetPath, checks, risks, assets: assets.details },
  };
}

export function runConfigPlan(input = {}) {
  const targetPath = typeof input.targetPath === 'string' && input.targetPath.trim() !== '' ? input.targetPath : '~/.omp';
  const plan = [
    `Review packaged templates under ${relative(process.cwd(), join(ROOT, 'assets'))}.`,
    `Compare assets/config.yml, assets/models.yml, and assets/mcp.json with ${targetPath}.`,
    'Compare bundled agents, skills, and hooks with the target installation.',
    'Prepare a patch for explicit user review before copying or overwriting any live config files.',
  ];
  const report = ['# OMP Config Patch Plan', '', ...plan.map((step, index) => `${index + 1}. ${step}`)].join('\n');

  return {
    ok: true,
    report,
    details: { targetPath, plan },
  };
}

function buildParameters(z) {
  return z.object({
    targetPath: z.string().optional(),
  });
}

function toolResult(output) {
  return {
    content: [textContent(output.report)],
    details: output.details,
    isError: !output.ok,
  };
}

function registerCommandIfAvailable(omp, name, description, runner) {
  if (typeof omp.registerCommand !== 'function') return;
  omp.registerCommand(name, {
    description,
    async handler(args) {
      const targetPath = typeof args === 'string' && args.trim() !== '' ? args.trim() : undefined;
      return runner(targetPath ? { targetPath } : {});
    },
  });
}

export default function ompConfigExtension(omp) {
  const z = omp.zod.z;
  const parameters = buildParameters(z);

  omp.registerTool({
    name: 'omp_config_doctor',
    label: 'OMP Config Doctor',
    description: 'Safely inspect packaged OMP config templates and report basic config application risks without modifying ~/.omp.',
    parameters,
    async execute(_toolCallId, params) {
      return toolResult(runConfigDoctor(paramsOrEmpty(params)));
    },
  });

  omp.registerTool({
    name: 'omp_config_assets',
    label: 'OMP Config Assets',
    description: 'List packaged OMP config assets, agents, skills, hooks, and template files.',
    parameters,
    async execute() {
      return toolResult(runConfigAssets());
    },
  });

  omp.registerTool({
    name: 'omp_config_plan',
    label: 'OMP Config Plan',
    description: 'Create a safe manual review plan before applying packaged OMP config templates to a target config directory.',
    parameters,
    async execute(_toolCallId, params) {
      return toolResult(runConfigPlan(paramsOrEmpty(params)));
    },
  });

  registerCommandIfAvailable(omp, 'config-doctor', 'Inspect packaged OMP config assets without modifying ~/.omp.', runConfigDoctor);
  registerCommandIfAvailable(omp, 'config-assets', 'List packaged OMP config assets.', runConfigAssets);
}
