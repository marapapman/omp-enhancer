import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, sep } from 'node:path';

import { assertWritableProjectFile } from './path-policy.js';
import { MermaidRuntimeError } from './runtime-error.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;
export const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;
const SUPPORTS_PROCESS_GROUP_TERMINATION = process.platform !== 'win32';

function commandFailure(code, message, details = {}) {
  return new MermaidRuntimeError(code, message, details);
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
      if (error instanceof MermaidRuntimeError) {
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
          if (error instanceof MermaidRuntimeError) {
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

export function revisionFor(dependencies, root) {
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

export async function assertArtifact(path, label) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size === 0) throw new Error('empty or not a file');
    return metadata;
  } catch (error) {
    throw new MermaidRuntimeError('ARTIFACT_MISSING', `${label} was not produced.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function publishArtifact(projectRoot, relativePath, sourcePath, mediaType) {
  const content = await readFile(sourcePath);
  const target = await assertWritableProjectFile(projectRoot, relativePath, 'artifact path');
  try {
    await writeFile(target.path, content, { flag: 'wx', mode: 0o644 });
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'EEXIST') throw error;
    const metadata = await lstat(target.path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new MermaidRuntimeError('SYMLINK_ESCAPE', 'An artifact target is not a regular file.');
    }
    const existing = await readFile(target.path);
    if (!existing.equals(content)) {
      throw new MermaidRuntimeError('ARTIFACT_CONFLICT', `Revision-bound artifact already exists with different content: ${relativePath}`);
    }
  }
  return {
    relativePath,
    mediaType,
    bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export function normalizeTimeout(value) {
  if (value === undefined || value === null) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1_000) {
    throw new MermaidRuntimeError('INVALID_PARAMETER', 'timeoutMs must be an integer of at least 1000.');
  }
  return Math.min(value, MAX_TIMEOUT_MS);
}
