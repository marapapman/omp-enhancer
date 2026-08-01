import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  ensureProjectDirectory,
  normalizeRelativePath,
  resolveExistingProjectFile,
  resolveProjectRoot,
} from './path-policy.js';
import { TikzRuntimeError } from './runtime-error.js';
import {
  assertArtifact,
  normalizeTimeout,
  publishArtifact,
  revisionFor,
  runBoundedCommand,
} from './render-tikz.js';

const MERMAID_CLI_PACKAGE = '@mermaid-js/mermaid-cli';
const THEMES = Object.freeze(['default', 'forest', 'dark', 'neutral']);

export const DEFAULT_OUTPUT_DIRECTORY = 'figures/mermaid/rendered';
export const DEFAULT_TIMEOUT_MS = 60_000;
export const MAX_TIMEOUT_MS = 120_000;
export const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
// Pinned so the serialized mermaid config (and therefore the revision hash) is
// stable across machines; mermaid-cli/puppeteer versions are pinned in
// package.json and included in the revision below.
export const MERMAID_FONT_FAMILY = 'Arial, Helvetica, sans-serif';

export const MERMAID_INSTALL_GUIDANCE = 'mermaid-cli is not installed. Run `npm install` at the repository root (the npm workspace installs @mermaid-js/mermaid-cli and puppeteer), then retry rendering.';
export const CHROME_NOT_FOUND_GUIDANCE = 'Headless Chrome was not found. Run `node node_modules/puppeteer/install.mjs` at the repository root (or set PUPPETEER_EXECUTABLE_PATH), then retry rendering.';

const PUPPETEER_LAUNCH_ARGS = Object.freeze([
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
]);

/**
 * Resolve the mmdc CLI entry. `@mermaid-js/mermaid-cli` exports only `"."`,
 * which points at `./src/index.js`, so the resolved entry's directory is the
 * package `src/` directory, not the package root — and its `src/cli.js`
 * subpath is NOT exported (ERR_PACKAGE_PATH_NOT_EXPORTED). Walk ancestors
 * until a package.json with the package name is found and read `bin.mmdc`.
 */
export async function resolveMermaidCliPath() {
  let entry;
  try {
    entry = import.meta.resolve(MERMAID_CLI_PACKAGE);
  } catch {
    return null;
  }
  let entryPath;
  try {
    entryPath = fileURLToPath(entry);
  } catch {
    return null;
  }
  let current = dirname(entryPath);
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      const pkg = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'));
      if (pkg.name === MERMAID_CLI_PACKAGE && typeof pkg.bin?.mmdc === 'string') {
        return resolve(current, pkg.bin.mmdc);
      }
    } catch {
      // Not a readable package.json here; keep walking ancestors.
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/** Read the mermaid-cli and transitive mermaid versions for the revision hash. */
async function readCliVersions(cliPath) {
  let current = dirname(cliPath);
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      const pkg = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'));
      if (pkg.name === MERMAID_CLI_PACKAGE) {
        return {
          mermaidCli: typeof pkg.version === 'string' ? pkg.version : 'unknown',
          mermaid: typeof pkg.dependencies?.mermaid === 'string' ? pkg.dependencies.mermaid : 'unknown',
        };
      }
    } catch {
      // keep walking
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return { mermaidCli: 'unknown', mermaid: 'unknown' };
}

/** Probe the puppeteer-managed Chrome executable; null when unavailable. */
async function defaultProbeChrome() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH?.trim()) {
    const configured = process.env.PUPPETEER_EXECUTABLE_PATH.trim();
    try {
      const metadata = await stat(configured);
      if (metadata.isFile()) return configured;
    } catch {
      // fall through to the puppeteer cache probe
    }
  }
  let mod;
  try {
    mod = await import('puppeteer');
  } catch {
    return null;
  }
  try {
    const executable = typeof mod.executablePath === 'function'
      ? mod.executablePath()
      : (typeof mod.default?.executablePath === 'function' ? mod.default.executablePath() : null);
    if (typeof executable !== 'string' || executable === '') return null;
    const metadata = await stat(executable);
    return metadata.isFile() ? executable : null;
  } catch {
    return null;
  }
}

function validateMermaidParams(input) {
  const hasSource = typeof input.source === 'string' && input.source.length > 0;
  const hasSourcePath = typeof input.sourcePath === 'string' && input.sourcePath.trim() !== '';
  if (hasSource === hasSourcePath) {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'Provide exactly one of source or sourcePath.');
  }
  const theme = input.theme ?? 'default';
  if (!THEMES.includes(theme)) {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'theme must be one of: default, forest, dark, neutral.');
  }
  if (input.width !== undefined && (!Number.isInteger(input.width) || input.width <= 0)) {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'width must be a positive integer.');
  }
  return {
    hasSource,
    theme,
    width: input.width,
    timeoutMs: normalizeTimeout(input.timeoutMs),
    outputDirectory: normalizeRelativePath(
      input.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY,
      'outputDirectory',
    ),
  };
}

async function readBoundedSource(path) {
  const metadata = await stat(path);
  if (metadata.size > MAX_SOURCE_BYTES) {
    throw new TikzRuntimeError('SOURCE_TOO_LARGE', 'A Mermaid source exceeds the 2 MiB safety limit.', {
      path,
      bytes: metadata.size,
    });
  }
  return readFile(path, 'utf8');
}

function mermaidRevisionFor(source, mermaidConfig, versions) {
  const dependencies = new Map();
  dependencies.set('source.mmd', Buffer.from(source, 'utf8'));
  dependencies.set('mermaid.config.json', Buffer.from(JSON.stringify(mermaidConfig), 'utf8'));
  dependencies.set('versions.json', Buffer.from(JSON.stringify(versions), 'utf8'));
  return revisionFor(dependencies, '');
}

async function runCheckedCommand(commandRunner, args, options) {
  const evidence = await commandRunner(process.execPath, args, options);
  if (!evidence || evidence.exitCode !== 0) {
    throw new TikzRuntimeError('COMMAND_FAILED', 'mermaid-cli did not report a successful exit.', {
      executable: process.execPath,
      exitCode: evidence?.exitCode ?? null,
    });
  }
  return evidence;
}

/**
 * Render Mermaid source to a revision-bound SVG artifact.
 *
 * Frozen param surface: `source` XOR `sourcePath` / `outputDirectory` /
 * `theme` (default|forest|dark|neutral) / `width` / `timeoutMs`.
 * The mermaid-cli process runs in an isolated temporary workspace through the
 * bounded command runner (no shell, process-group kill, output cap, timeout).
 * Rendering is fully offline: sandbox launch flags plus DNS blocking for
 * everything except localhost.
 */
export async function renderMermaid(input = {}, options = {}) {
  const projectRoot = await resolveProjectRoot(input.projectRoot);
  const params = validateMermaidParams(input);

  let source;
  let sourceBase;
  let sourceProjectPath;
  if (params.hasSource) {
    if (input.source.includes('\0')) {
      throw new TikzRuntimeError('INVALID_PARAMETER', 'source must not contain NUL bytes.');
    }
    if (Buffer.byteLength(input.source, 'utf8') > MAX_SOURCE_BYTES) {
      throw new TikzRuntimeError('SOURCE_TOO_LARGE', 'Mermaid source exceeds the 2 MiB safety limit.');
    }
    source = input.source;
    sourceBase = 'diagram';
    sourceProjectPath = 'diagram.mmd';
  } else {
    const resolved = await resolveExistingProjectFile(projectRoot, input.sourcePath, 'sourcePath');
    const extension = extname(resolved.path).toLocaleLowerCase('en-US');
    if (extension !== '.mmd' && extension !== '.md') {
      throw new TikzRuntimeError('INVALID_PARAMETER', 'sourcePath must identify a .mmd or .md file.');
    }
    if (basename(resolved.path).startsWith('-')) {
      throw new TikzRuntimeError('INVALID_PARAMETER', 'sourcePath basename must not begin with a dash.');
    }
    source = await readBoundedSource(resolved.path);
    sourceBase = basename(resolved.path, extension);
    sourceProjectPath = relative(projectRoot, resolved.path).split(sep).join('/');
  }

  const cliPath = options.mermaidCliPath === undefined
    ? await resolveMermaidCliPath()
    : options.mermaidCliPath;
  if (!cliPath) {
    throw new TikzRuntimeError('MERMAID_NOT_INSTALLED', MERMAID_INSTALL_GUIDANCE, {
      package: MERMAID_CLI_PACKAGE,
    });
  }
  const chromePath = await (options.probeChrome ?? defaultProbeChrome)();
  if (!chromePath) {
    throw new TikzRuntimeError('CHROME_NOT_FOUND', CHROME_NOT_FOUND_GUIDANCE);
  }
  const versions = await readCliVersions(cliPath);
  const mermaidConfig = {
    theme: params.theme,
    htmlLabels: false,
    fontFamily: MERMAID_FONT_FAMILY,
    flowchart: {},
  };
  const revision = mermaidRevisionFor(source, mermaidConfig, versions);
  const revisionShort = revision.slice(0, 12);

  const destination = await ensureProjectDirectory(projectRoot, params.outputDirectory, 'outputDirectory');
  const commandRunner = options.commandRunner ?? runBoundedCommand;
  const commandOptions = {
    timeoutMs: params.timeoutMs,
    maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
    signal: options.signal,
  };

  const temporaryRoot = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'omp-mermaid-render-'));
  const workspace = join(temporaryRoot, 'workspace');
  try {
    await mkdir(workspace, { recursive: true });
    const sourceFile = join(workspace, 'source.mmd');
    const mermaidConfigFile = join(workspace, 'mermaid.config.json');
    const puppeteerConfigFile = join(workspace, 'puppeteer.config.json');
    const outSvg = join(workspace, `${sourceBase}.svg`);
    await writeFile(sourceFile, source, 'utf8');
    await writeFile(mermaidConfigFile, `${JSON.stringify(mermaidConfig, null, 2)}\n`, 'utf8');
    await writeFile(puppeteerConfigFile, `${JSON.stringify({ args: PUPPETEER_LAUNCH_ARGS }, null, 2)}\n`, 'utf8');

    const args = [
      cliPath,
      '-i', sourceFile,
      '-o', outSvg,
      '-e', 'svg',
      '-c', mermaidConfigFile,
      '-p', puppeteerConfigFile,
    ];
    if (input.theme !== undefined) args.push('-t', params.theme);
    if (params.width !== undefined) args.push('-w', String(params.width));

    const evidence = await runCheckedCommand(commandRunner, args, { ...commandOptions, cwd: workspace });
    await assertArtifact(outSvg, 'SVG artifact');

    const prefix = `${destination.normalized}/${sourceBase}-${revisionShort}`;
    const artifacts = {
      svg: await publishArtifact(projectRoot, `${prefix}.svg`, outSvg, 'image/svg+xml'),
    };

    return {
      ok: true,
      sourcePath: sourceProjectPath,
      revision,
      artifacts,
      evidence: {
        isolatedWorkspace: true,
        offline: true,
        sandboxFlags: true,
        commands: [evidence],
      },
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
