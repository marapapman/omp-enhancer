import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TikzRuntimeError } from './runtime-error.js';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_STDOUT_BYTES = 25 * 1024 * 1024;
const MAX_STDERR_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const SUPPORTS_PROCESS_GROUP_TERMINATION = process.platform !== 'win32';
const RESOURCE_LIMIT_ARGS = Object.freeze([
  '-limit', 'memory', '128MiB',
  '-limit', 'map', '256MiB',
  '-limit', 'disk', '256MiB',
  '-limit', 'area', '40MP',
  '-limit', 'thread', '1',
  '-limit', 'time', '25',
]);
const NORMALIZATION_ARGS = Object.freeze([
  '-auto-orient',
  '-resize', '2048x2048>',
  '-strip',
  '-define', 'png:exclude-chunks=date,time',
  '-define', 'png:compression-level=9',
  'png:-',
]);

class ExecutableNotFoundError extends Error {
  constructor(executable) {
    super(`${executable} was not found.`);
    this.executable = executable;
  }
}

function runtimeError(code, message, details = {}) {
  return new TikzRuntimeError(code, message, details);
}

export function imageMagickExecutableCandidates(platform = process.platform) {
  return platform === 'win32' ? ['magick'] : ['magick', 'convert'];
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

export function parsePngDimensions(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer)
    || buffer.length < 24
    || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    || buffer.readUInt32BE(8) !== 13
    || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw runtimeError('INVALID_IMAGE', 'ImageMagick did not return a valid PNG header.');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const maximumDimension = options.maximumDimension;
  if (width < 1 || height < 1
    || (maximumDimension !== undefined && (width > maximumDimension || height > maximumDimension))) {
    throw runtimeError('INVALID_IMAGE', 'The PNG dimensions are invalid or exceed the configured limit.', {
      width,
      height,
      maximumDimension: maximumDimension ?? null,
    });
  }
  return { width, height };
}

function validateInputDimensions(format, dimensions) {
  if (dimensions.width !== null && dimensions.height !== null
    && dimensions.width * dimensions.height > MAX_INPUT_PIXELS) {
    throw runtimeError('IMAGE_TOO_LARGE', 'The decoded input image exceeds the 40 megapixel safety limit.', {
      format,
      width: dimensions.width,
      height: dimensions.height,
      maximumPixels: MAX_INPUT_PIXELS,
    });
  }
  return { format, ...dimensions };
}

function jpegDimensions(buffer) {
  let offset = 2;
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }
    offset += length;
  }
  return { width: null, height: null };
}

function webpDimensions(buffer) {
  if (buffer.length < 30) return { width: null, height: null };
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
    };
  }
  if (chunk === 'VP8L' && buffer[20] === 0x2f) {
    return {
      width: 1 + buffer[21] + ((buffer[22] & 0x3f) << 8),
      height: 1 + ((buffer[22] & 0xc0) >> 6) + (buffer[23] << 2) + ((buffer[24] & 0x0f) << 10),
    };
  }
  if (chunk === 'VP8 ' && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return { width: null, height: null };
}

export function detectInputImage(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw runtimeError('INVALID_IMAGE', 'The image processor requires a binary input buffer.');
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw runtimeError('IMAGE_TOO_LARGE', 'The input image exceeds the 25 MiB safety limit.', {
      bytes: buffer.length,
      maximumBytes: MAX_INPUT_BYTES,
    });
  }
  if (buffer.length >= PNG_SIGNATURE.length
    && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return validateInputDimensions('png', parsePngDimensions(buffer));
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return validateInputDimensions('jpeg', jpegDimensions(buffer));
  }
  if (buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return validateInputDimensions('webp', webpDimensions(buffer));
  }
  throw runtimeError(
    'UNSUPPORTED_IMAGE_FORMAT',
    'Only files with valid PNG, JPEG, or WebP magic bytes are supported.',
  );
}

function commandEvidence(executable, args, startedAt, data = {}) {
  return {
    executable,
    args: [...args],
    shell: false,
    cwdIsolation: 'temporary-directory',
    durationMs: Date.now() - startedAt,
    ...data,
  };
}

function runImageMagickCandidate(executable, args, input, options) {
  const spawnImpl = options.spawnImpl ?? spawn;
  const killImpl = options.killImpl ?? process.kill;
  const maxStdoutBytes = options.maxStdoutBytes ?? MAX_STDOUT_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? MAX_STDERR_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawnImpl(executable, args, {
        cwd: options.cwd,
        detached: SUPPORTS_PROCESS_GROUP_TERMINATION,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        rejectPromise(new ExecutableNotFoundError(executable));
        return;
      }
      rejectPromise(runtimeError('IMAGE_PROCESSOR_START_FAILED', `Unable to start ${executable}.`, {
        executable,
        cause: error instanceof Error ? error.message : String(error),
      }));
      return;
    }

    let settled = false;
    let spawned = false;
    let terminalError;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdoutChunks = [];
    const stderrChunks = [];
    let timer;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      callback(value);
    };
    const stopWith = (error) => {
      if (terminalError || settled) return;
      terminalError = error;
      const canKillProcessGroup = SUPPORTS_PROCESS_GROUP_TERMINATION
        && Number.isInteger(child.pid)
        && child.pid > 0;
      error.details = {
        ...error.details,
        command: commandEvidence(executable, args, startedAt, {
          stdinBytes: input.length,
          stdoutBytes,
          stderrBytes,
        }),
        terminationScope: canKillProcessGroup ? 'process-group' : 'direct-child-only',
      };
      if (canKillProcessGroup) {
        try {
          killImpl(-child.pid, 'SIGKILL');
          return;
        } catch (killError) {
          error.details = {
            ...error.details,
            terminationScope: 'direct-child-only',
            processGroupTerminationFailure: killError instanceof Error ? killError.message : String(killError),
          };
        }
      }
      child.kill('SIGKILL');
    };
    const abort = () => stopWith(runtimeError(
      'IMAGE_PROCESSOR_ABORTED',
      `Image normalization with ${executable} was aborted.`,
      { executable },
    ));

    child.once('spawn', () => { spawned = true; });
    child.stdout?.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stdoutBytes += buffer.length;
      if (stdoutBytes > maxStdoutBytes) {
        stopWith(runtimeError('IMAGE_OUTPUT_LIMIT', `Image output exceeded ${maxStdoutBytes} bytes.`, {
          executable,
          maximumBytes: maxStdoutBytes,
        }));
        return;
      }
      stdoutChunks.push(buffer);
    });
    child.stderr?.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      stderrBytes += buffer.length;
      if (stderrBytes > maxStderrBytes) {
        stopWith(runtimeError('IMAGE_STDERR_LIMIT', `ImageMagick diagnostics exceeded ${maxStderrBytes} bytes.`, {
          executable,
          maximumBytes: maxStderrBytes,
        }));
        return;
      }
      stderrChunks.push(buffer);
    });
    child.stdin?.once('error', (error) => {
      if (!settled && !terminalError && error?.code !== 'EPIPE') {
        stopWith(runtimeError('IMAGE_PROCESSOR_IO_FAILED', `Unable to provide image input to ${executable}.`, {
          executable,
          cause: error instanceof Error ? error.message : String(error),
        }));
      }
    });
    child.once('error', (error) => {
      if (terminalError) {
        finish(rejectPromise, terminalError);
        return;
      }
      if (!spawned && error && typeof error === 'object' && error.code === 'ENOENT') {
        finish(rejectPromise, new ExecutableNotFoundError(executable));
        return;
      }
      finish(rejectPromise, runtimeError('IMAGE_PROCESSOR_START_FAILED', `Unable to start ${executable}.`, {
        executable,
        cause: error instanceof Error ? error.message : String(error),
      }));
    });
    child.once('close', (exitCode, signal) => {
      if (terminalError) {
        finish(rejectPromise, terminalError);
        return;
      }
      const evidence = commandEvidence(executable, args, startedAt, {
        exitCode,
        signal: signal ?? null,
        stdinBytes: input.length,
        stdoutBytes,
        stderrBytes,
      });
      if (exitCode !== 0) {
        finish(rejectPromise, runtimeError(
          'IMAGE_NORMALIZATION_FAILED',
          `${executable} could not decode and normalize the image.`,
          {
            command: evidence,
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
          },
        ));
        return;
      }
      finish(resolvePromise, {
        buffer: Buffer.concat(stdoutChunks),
        evidence,
      });
    });

    options.signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => stopWith(runtimeError(
      'IMAGE_PROCESSOR_TIMEOUT',
      `Image normalization with ${executable} exceeded ${timeoutMs} ms.`,
      { executable, timeoutMs },
    )), timeoutMs);
    timer.unref?.();
    if (options.signal?.aborted) abort();
    if (!terminalError) {
      try {
        child.stdin.end(input);
      } catch (error) {
        stopWith(runtimeError('IMAGE_PROCESSOR_IO_FAILED', `Unable to provide image input to ${executable}.`, {
          executable,
          cause: error instanceof Error ? error.message : String(error),
        }));
      }
    }
  });
}

export async function normalizeImageWithImageMagick(buffer, options = {}) {
  const input = detectInputImage(buffer);
  const platform = options.platform ?? process.platform;
  const windows = platform === 'win32';
  const executableCandidates = imageMagickExecutableCandidates(platform);
  if (options.signal?.aborted) {
    throw runtimeError('IMAGE_PROCESSOR_ABORTED', 'Image normalization was aborted before ImageMagick started.', {
      executableCandidates,
      terminationScope: 'not-started',
    });
  }
  const workspace = await mkdtemp(join(tmpdir(), 'omp-tikz-image-'));
  const args = [...RESOURCE_LIMIT_ARGS, `${input.format}:-`, ...NORMALIZATION_ARGS];
  const missing = [];
  try {
    for (const executable of executableCandidates) {
      let normalized;
      try {
        normalized = await runImageMagickCandidate(executable, args, buffer, {
          ...options,
          cwd: workspace,
        });
      } catch (error) {
        if (error instanceof ExecutableNotFoundError) {
          missing.push(executable);
          continue;
        }
        throw error;
      }
      let output;
      try {
        output = parsePngDimensions(normalized.buffer, { maximumDimension: 2048 });
      } catch (error) {
        if (error instanceof TikzRuntimeError) {
          error.details = { ...error.details, command: normalized.evidence };
        }
        throw error;
      }
      return {
        buffer: normalized.buffer,
        input,
        output: { format: 'png', ...output },
        evidence: normalized.evidence,
      };
    }
    throw runtimeError(
      'IMAGE_PROCESSOR_UNAVAILABLE',
      windows
        ? 'ImageMagick is required to normalize TikZ raster assets, but `magick` is unavailable on Windows.'
        : 'ImageMagick is required to normalize TikZ raster assets, but neither fixed executable is available.',
      {
        executables: executableCandidates,
        attempted: missing,
        installHint: windows
          ? 'Windows requires `magick`; install ImageMagick and make `magick` available on PATH.'
          : 'Install ImageMagick so either `magick` (preferred) or `convert` is available on PATH.',
      },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export const imageMagickImageProcessor = Object.freeze({ normalize: normalizeImageWithImageMagick });
export const supportedInputFormats = Object.freeze(['png', 'jpeg', 'webp']);
