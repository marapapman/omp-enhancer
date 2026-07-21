import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

import {
  assertWritableProjectFile,
  ensureProjectDirectory,
  normalizeRelativePath,
  pathIsInside,
  resolveExistingProjectFile,
  resolveProjectRoot,
} from './path-policy.js';
import { TikzRuntimeError } from './runtime-error.js';

const DEFAULT_EXECUTABLES = Object.freeze({
  latexmk: 'latexmk',
  dvisvgm: 'dvisvgm',
  pdftocairo: 'pdftocairo',
});
const DEFAULT_OUTPUT_DIRECTORY = 'figures/tikz/rendered';
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
const MAX_TEX_FILES = 100;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const GRAPHIC_EXTENSIONS = ['', '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.svg'];
const SUPPORTS_PROCESS_GROUP_TERMINATION = process.platform !== 'win32';

function commandFailure(code, message, details = {}) {
  return new TikzRuntimeError(code, message, details);
}

export function runBoundedCommand(executable, args, options = {}) {
  if (typeof executable !== 'string' || executable.trim() === '') {
    return Promise.reject(commandFailure('INVALID_EXECUTABLE', 'A fixed executable is required.'));
  }
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== 'string')) {
    return Promise.reject(commandFailure('INVALID_ARGUMENTS', 'Command arguments must be a string array.'));
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? MAX_COMMAND_OUTPUT_BYTES;
  const spawnImpl = options.spawnImpl ?? spawn;
  const killImpl = options.killImpl ?? process.kill;

  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    let settled = false;
    let terminalError;
    let capturedBytes = 0;
    const stdout = [];
    const stderr = [];
    const child = spawnImpl(executable, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        shell_escape: 'f',
        openin_any: 'p',
        openout_any: 'p',
      },
      detached: SUPPORTS_PROCESS_GROUP_TERMINATION,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      callback(value);
    };
    const stopWith = (error) => {
      if (terminalError) return;
      terminalError = error;
      const canKillProcessGroup = SUPPORTS_PROCESS_GROUP_TERMINATION
        && Number.isInteger(child.pid)
        && child.pid > 0;
      if (error instanceof TikzRuntimeError) {
        error.details = {
          ...error.details,
          terminationScope: canKillProcessGroup ? 'process-group' : 'direct-child-only',
        };
      }
      if (canKillProcessGroup) {
        try {
          killImpl(-child.pid, 'SIGKILL');
          return;
        } catch (killError) {
          if (error instanceof TikzRuntimeError) {
            error.details = {
              ...error.details,
              terminationScope: 'direct-child-only',
              processGroupTerminationFailure: killError instanceof Error ? killError.message : String(killError),
            };
          }
        }
      }
      child.kill('SIGKILL');
    };
    const capture = (target) => (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      capturedBytes += buffer.length;
      if (capturedBytes > maxOutputBytes) {
        stopWith(commandFailure('OUTPUT_LIMIT', `Command output exceeded ${maxOutputBytes} bytes.`, {
          executable,
          maxOutputBytes,
        }));
        return;
      }
      target.push(buffer);
    };
    child.stdout?.on('data', capture(stdout));
    child.stderr?.on('data', capture(stderr));
    child.once('error', (error) => {
      finish(rejectPromise, commandFailure('COMMAND_START_FAILED', `Unable to start ${executable}.`, {
        executable,
        cause: error instanceof Error ? error.message : String(error),
      }));
    });
    child.once('close', (exitCode, signal) => {
      if (terminalError) {
        finish(rejectPromise, terminalError);
        return;
      }
      const evidence = {
        executable,
        args: [...args],
        exitCode,
        signal: signal ?? null,
        durationMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        outputTruncated: false,
        shell: false,
      };
      if (exitCode !== 0) {
        finish(rejectPromise, commandFailure('COMMAND_FAILED', `${executable} exited with code ${exitCode}.`, evidence));
        return;
      }
      finish(resolvePromise, evidence);
    });

    const abort = () => stopWith(commandFailure('COMMAND_ABORTED', `${executable} was aborted.`, { executable }));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => {
      stopWith(commandFailure('COMMAND_TIMEOUT', `${executable} exceeded the ${timeoutMs} ms timeout.`, {
        executable,
        timeoutMs,
      }));
    }, timeoutMs);
    timer.unref?.();
  });
}

function stripComments(source) {
  return source.split(/\r?\n/u).map((line) => {
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== '%') continue;
      let slashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) slashes += 1;
      if (slashes % 2 === 0) return line.slice(0, index);
    }
    return line;
  }).join('\n');
}

function assertSafeTexSyntax(source, sourceRelativePath) {
  const visible = stripComments(source);
  const forbidden = [
    /\\(?:immediate\s*)?write\s*18\b/iu,
    /\\(?:ShellEscape|shellescape)\b/u,
    /\\(?:openin|openout|readline|@@input)\b/u,
    /\\(?:usepackage|RequirePackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*shellesc[^}]*\}/iu,
    /\\(?:import|subimport|subfile|lstinputlisting|verbatiminput|includepdf)\b/iu,
    /\\input\s+(?!\{)/u,
  ];
  if (forbidden.some((pattern) => pattern.test(visible))) {
    throw new TikzRuntimeError('UNSAFE_TEX', `Unsafe or unsupported TeX file access in ${sourceRelativePath}.`, {
      sourcePath: sourceRelativePath,
    });
  }
  return visible;
}

function referenceCandidates(rawPath, kind) {
  if (extname(rawPath) !== '') return [rawPath];
  if (kind === 'input' || kind === 'include') return [`${rawPath}.tex`];
  return GRAPHIC_EXTENSIONS.map((extension) => `${rawPath}${extension}`);
}

async function resolveReference(root, sourcePath, rawPath, kind) {
  const trimmed = rawPath.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//iu.test(trimmed) || /^(?:https?|ftp|data):/iu.test(trimmed)) {
    throw new TikzRuntimeError('REMOTE_RESOURCE', `Remote ${kind} resources are not allowed.`, {
      sourcePath: relative(root, sourcePath).split(sep).join('/'),
      resource: trimmed,
    });
  }
  if (trimmed.includes('\\') || trimmed.includes('#') || trimmed.includes('{') || trimmed.includes('}')) {
    throw new TikzRuntimeError('UNSAFE_TEX', `Dynamic ${kind} paths are not supported.`, { resource: trimmed });
  }

  let normalized;
  try {
    normalized = normalizeRelativePath(trimmed, `${kind} path`);
  } catch (error) {
    if (error instanceof TikzRuntimeError && error.code === 'INVALID_PARAMETER') throw error;
    throw new TikzRuntimeError('PATH_OUTSIDE_PROJECT', `${kind} path must not use traversal or an absolute path.`, {
      resource: trimmed,
    });
  }

  for (const candidate of referenceCandidates(normalized, kind)) {
    const lexical = resolve(dirname(sourcePath), candidate);
    if (!pathIsInside(root, lexical)) {
      throw new TikzRuntimeError('PATH_OUTSIDE_PROJECT', `${kind} path escapes the project root.`, {
        resource: trimmed,
      });
    }
    try {
      const resolved = await realpath(lexical);
      if (!pathIsInside(root, resolved)) {
        throw new TikzRuntimeError('SYMLINK_ESCAPE', `${kind} path resolves outside the project root.`, {
          resource: trimmed,
        });
      }
      const metadata = await stat(resolved);
      if (!metadata.isFile()) continue;
      return resolved;
    } catch (error) {
      if (error instanceof TikzRuntimeError) throw error;
      if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
    }
  }
  throw new TikzRuntimeError('FILE_NOT_FOUND', `${kind} resource does not exist: ${trimmed}`, {
    resource: trimmed,
  });
}

async function readBoundedSource(path) {
  const metadata = await stat(path);
  if (metadata.size > MAX_SOURCE_BYTES) {
    throw new TikzRuntimeError('SOURCE_TOO_LARGE', 'A TeX source exceeds the 2 MiB safety limit.', {
      path,
      bytes: metadata.size,
    });
  }
  return readFile(path, 'utf8');
}

async function collectDependencyGraph(root, entryPath) {
  const pending = [entryPath];
  const dependencies = new Map();
  let texFiles = 0;

  while (pending.length > 0) {
    const path = pending.shift();
    if (dependencies.has(path)) continue;
    if (extname(path).toLocaleLowerCase('en-US') !== '.tex') {
      dependencies.set(path, await readFile(path));
      continue;
    }
    texFiles += 1;
    if (texFiles > MAX_TEX_FILES) {
      throw new TikzRuntimeError('DEPENDENCY_LIMIT', `TeX dependency graph exceeds ${MAX_TEX_FILES} files.`);
    }
    const source = await readBoundedSource(path);
    const visible = assertSafeTexSyntax(source, relative(root, path).split(sep).join('/'));
    dependencies.set(path, Buffer.from(source));

    const referencePattern = /\\(input|include|includegraphics)\*?(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/giu;
    for (const match of visible.matchAll(referencePattern)) {
      const kind = match[1].toLocaleLowerCase('en-US');
      const referenced = await resolveReference(root, path, match[2], kind);
      if ((kind === 'input' || kind === 'include')
        && extname(referenced).toLocaleLowerCase('en-US') !== '.tex') {
        throw new TikzRuntimeError('UNSAFE_TEX', 'Included TeX resources must resolve to .tex files.');
      }
      pending.push(referenced);
    }
  }
  return dependencies;
}

function revisionFor(dependencies, root) {
  const digest = createHash('sha256');
  const sorted = [...dependencies.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [path, content] of sorted) {
    digest.update(relative(root, path).split(sep).join('/'));
    digest.update('\0');
    digest.update(content);
    digest.update('\0');
  }
  return digest.digest('hex');
}

async function copyDependencies(dependencies, root, workspace) {
  for (const [sourcePath] of dependencies) {
    const relativePath = relative(root, sourcePath);
    const destination = join(workspace, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
  }
}

async function assertArtifact(path, label) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size === 0) throw new Error('empty or not a file');
    return metadata;
  } catch (error) {
    throw new TikzRuntimeError('ARTIFACT_MISSING', `${label} was not produced.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function publishArtifact(projectRoot, relativePath, sourcePath, mediaType) {
  const content = await readFile(sourcePath);
  const target = await assertWritableProjectFile(projectRoot, relativePath, 'artifact path');
  try {
    await writeFile(target.path, content, { flag: 'wx', mode: 0o644 });
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'EEXIST') throw error;
    const metadata = await lstat(target.path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new TikzRuntimeError('SYMLINK_ESCAPE', 'An artifact target is not a regular file.');
    }
    const existing = await readFile(target.path);
    if (!existing.equals(content)) {
      throw new TikzRuntimeError('ARTIFACT_CONFLICT', `Revision-bound artifact already exists with different content: ${relativePath}`);
    }
  }
  return {
    relativePath,
    mediaType,
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function normalizeTimeout(value) {
  if (value === undefined || value === null) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1_000) {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'timeoutMs must be an integer of at least 1000.');
  }
  return Math.min(value, MAX_TIMEOUT_MS);
}

async function runChecked(commandRunner, executable, args, options) {
  const evidence = await commandRunner(executable, args, options);
  if (!evidence || evidence.exitCode !== 0) {
    throw new TikzRuntimeError('COMMAND_FAILED', `${executable} did not report a successful exit.`, {
      executable,
      exitCode: evidence?.exitCode ?? null,
    });
  }
  return evidence;
}

export async function renderTikz(input = {}, options = {}) {
  const projectRoot = await resolveProjectRoot(input.projectRoot);
  const source = await resolveExistingProjectFile(projectRoot, input.sourcePath, 'sourcePath');
  if (extname(source.path).toLocaleLowerCase('en-US') !== '.tex') {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'sourcePath must identify a .tex file.');
  }
  if (basename(source.path).startsWith('-')) {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'sourcePath basename must not begin with a dash.');
  }
  const outputDirectory = normalizeRelativePath(
    input.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY,
    'outputDirectory',
  );
  const destination = await ensureProjectDirectory(projectRoot, outputDirectory, 'outputDirectory');
  const timeoutMs = normalizeTimeout(input.timeoutMs);
  const dependencies = await collectDependencyGraph(projectRoot, source.path);
  const revision = revisionFor(dependencies, projectRoot);
  const revisionShort = revision.slice(0, 12);
  const sourceBase = basename(source.path, '.tex');
  const sourceProjectPath = relative(projectRoot, source.path).split(sep).join('/');
  const temporaryRoot = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'omp-tikz-render-'));
  const workspace = join(temporaryRoot, 'workspace');
  const buildDirectory = join(temporaryRoot, 'build');
  const executables = { ...DEFAULT_EXECUTABLES, ...(options.executables ?? {}) };
  const commandRunner = options.commandRunner ?? runBoundedCommand;
  const commandOptions = {
    timeoutMs,
    maxOutputBytes: MAX_COMMAND_OUTPUT_BYTES,
    signal: options.signal,
  };

  try {
    await mkdir(workspace, { recursive: true });
    await mkdir(buildDirectory, { recursive: true });
    await copyDependencies(dependencies, projectRoot, workspace);
    const isolatedSource = join(workspace, sourceProjectPath);
    const isolatedCwd = dirname(isolatedSource);
    const pdfPath = join(buildDirectory, `${sourceBase}.pdf`);
    const svgPath = join(buildDirectory, `${sourceBase}.svg`);
    const fullPngPrefix = join(buildDirectory, `${sourceBase}-full`);
    const scale60PngPrefix = join(buildDirectory, `${sourceBase}-60`);
    const fullPngPath = `${fullPngPrefix}.png`;
    const scale60PngPath = `${scale60PngPrefix}.png`;
    const evidence = [];

    evidence.push(await runChecked(commandRunner, executables.latexmk, [
      '-pdf',
      '-halt-on-error',
      '-interaction=nonstopmode',
      '-file-line-error',
      '-no-shell-escape',
      `-outdir=${buildDirectory}`,
      basename(isolatedSource),
    ], { ...commandOptions, cwd: isolatedCwd }));
    await assertArtifact(pdfPath, 'PDF artifact');

    evidence.push(await runChecked(commandRunner, executables.dvisvgm, [
      '--pdf',
      '--no-fonts',
      '--exact-bbox',
      `--output=${svgPath}`,
      pdfPath,
    ], { ...commandOptions, cwd: buildDirectory }));
    evidence.push(await runChecked(commandRunner, executables.pdftocairo, [
      '-png',
      '-singlefile',
      '-r',
      '300',
      pdfPath,
      fullPngPrefix,
    ], { ...commandOptions, cwd: buildDirectory }));
    evidence.push(await runChecked(commandRunner, executables.pdftocairo, [
      '-png',
      '-singlefile',
      '-r',
      '180',
      pdfPath,
      scale60PngPrefix,
    ], { ...commandOptions, cwd: buildDirectory }));
    await Promise.all([
      assertArtifact(svgPath, 'SVG artifact'),
      assertArtifact(fullPngPath, 'full-size PNG artifact'),
      assertArtifact(scale60PngPath, '60%-scale PNG artifact'),
    ]);

    const prefix = `${destination.normalized}/${sourceBase}-${revisionShort}`;
    const artifacts = {
      pdf: await publishArtifact(projectRoot, `${prefix}.pdf`, pdfPath, 'application/pdf'),
      svg: await publishArtifact(projectRoot, `${prefix}.svg`, svgPath, 'image/svg+xml'),
      fullPng: await publishArtifact(projectRoot, `${prefix}-full.png`, fullPngPath, 'image/png'),
      scale60Png: await publishArtifact(projectRoot, `${prefix}-60.png`, scale60PngPath, 'image/png'),
    };

    return {
      ok: true,
      sourcePath: sourceProjectPath,
      revision,
      artifacts,
      evidence: {
        isolatedWorkspace: true,
        shellEscape: false,
        dependencyCount: dependencies.size,
        rasterScale: { fullDpi: 300, scale60Dpi: 180 },
        commands: evidence,
      },
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export {
  DEFAULT_EXECUTABLES,
  DEFAULT_OUTPUT_DIRECTORY,
  MAX_COMMAND_OUTPUT_BYTES,
};
