import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, win32 } from 'node:path';
import { tmpdir } from 'node:os';

import { imageMagickImageProcessor } from './image-processor.js';
import {
  assertWritableProjectFile,
  ensureProjectDirectory,
  normalizeRelativePath,
  pathIsInside,
  resolveExistingProjectFile,
  resolveProjectRoot,
} from './path-policy.js';
import { TikzRuntimeError } from './runtime-error.js';

const DEFAULT_OUTPUT_DIRECTORY = 'figures/tikz/assets';
const MANIFEST_NAME = 'assets.manifest.json';
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const SOURCE_READ_CHUNK_BYTES = 64 * 1024;

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new TikzRuntimeError('INVALID_PARAMETER', `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized === '') return undefined;
  if (normalized.length > maxLength) {
    throw new TikzRuntimeError('INVALID_PARAMETER', `${label} must not exceed ${maxLength} characters.`);
  }
  return normalized;
}

async function resolveInputImage(projectRoot, inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '' || inputPath.includes('\0')) {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'inputPath must identify a PNG, JPEG, or WebP file.');
  }
  const trimmed = inputPath.trim();
  if (!isAbsolute(trimmed) && !win32.isAbsolute(trimmed)) {
    return (await resolveExistingProjectFile(projectRoot, trimmed, 'inputPath')).path;
  }

  let metadata;
  try {
    metadata = await lstat(trimmed);
  } catch (error) {
    throw new TikzRuntimeError('FILE_NOT_FOUND', `inputPath does not exist: ${trimmed}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (metadata.isSymbolicLink()) {
    throw new TikzRuntimeError('INPUT_SYMLINK', 'inputPath must not be a symbolic link.');
  }
  if (!metadata.isFile()) {
    throw new TikzRuntimeError('INVALID_FILE', 'inputPath must identify a regular file.');
  }
  const resolved = await realpath(trimmed);
  const temporaryRoot = await realpath(tmpdir());
  if (!pathIsInside(projectRoot, resolved) && !pathIsInside(temporaryRoot, resolved)) {
    throw new TikzRuntimeError(
      'INPUT_OUTSIDE_ALLOWED_ROOT',
      'An absolute inputPath must be inside the project or the system temporary directory.',
    );
  }
  return resolved;
}

function throwIfSourceReadAborted(signal) {
  if (signal?.aborted) {
    throw new TikzRuntimeError('IMAGE_READ_ABORTED', 'Reading the input image was aborted.');
  }
}

function sourceOpenFlags() {
  const noFollow = process.platform === 'win32' ? 0 : (fsConstants.O_NOFOLLOW ?? 0);
  return fsConstants.O_RDONLY | noFollow;
}

async function readBoundedSource(path, options = {}) {
  const maximumBytes = Number.isInteger(options.maximumBytes)
    && options.maximumBytes > 0
    && options.maximumBytes <= MAX_INPUT_BYTES
    ? options.maximumBytes
    : MAX_INPUT_BYTES;
  throwIfSourceReadAborted(options.signal);

  let fileHandle;
  try {
    fileHandle = await open(path, sourceOpenFlags());
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ELOOP') {
      throw new TikzRuntimeError('INPUT_SYMLINK', 'inputPath must not be a symbolic link.');
    }
    const missing = error && typeof error === 'object' && error.code === 'ENOENT';
    throw new TikzRuntimeError(missing ? 'FILE_NOT_FOUND' : 'IMAGE_READ_FAILED', `Unable to open inputPath: ${path}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  let operationFailed = false;
  try {
    const metadata = await fileHandle.stat();
    if (!metadata.isFile()) {
      throw new TikzRuntimeError('INVALID_FILE', 'inputPath must identify a regular file.');
    }
    if (metadata.size > maximumBytes) {
      throw new TikzRuntimeError('IMAGE_TOO_LARGE', `File exceeds the ${maximumBytes}-byte safety limit.`, {
        bytes: metadata.size,
        maximumBytes,
      });
    }
    await options.afterStat?.({ fileHandle, metadata, path });

    const chunks = [];
    let bytes = 0;
    while (bytes <= maximumBytes) {
      throwIfSourceReadAborted(options.signal);
      const remaining = maximumBytes + 1 - bytes;
      if (remaining === 0) break;
      const chunk = Buffer.allocUnsafe(Math.min(SOURCE_READ_CHUNK_BYTES, remaining));
      const { bytesRead } = await fileHandle.read(chunk, 0, chunk.length, null);
      throwIfSourceReadAborted(options.signal);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      bytes += bytesRead;
    }
    if (bytes > maximumBytes) {
      throw new TikzRuntimeError('IMAGE_TOO_LARGE', `File exceeds the ${maximumBytes}-byte safety limit.`, {
        bytes,
        maximumBytes,
      });
    }
    return Buffer.concat(chunks, bytes);
  } catch (error) {
    operationFailed = true;
    if (error instanceof TikzRuntimeError) throw error;
    throw new TikzRuntimeError('IMAGE_READ_FAILED', 'Unable to read the input image safely.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    try {
      await fileHandle.close();
    } catch (error) {
      if (!operationFailed) {
        throw new TikzRuntimeError('IMAGE_READ_FAILED', 'Unable to close the input image safely.', {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

async function writeContentAddressedFile(path, buffer) {
  try {
    await writeFile(path, buffer, { flag: 'wx', mode: 0o644 });
    return;
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'EEXIST') throw error;
  }

  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new TikzRuntimeError('SYMLINK_ESCAPE', 'The content-addressed asset path is not a regular file.');
  }
  const existing = await readFile(path);
  if (!existing.equals(buffer)) {
    throw new TikzRuntimeError('HASH_COLLISION', 'An existing asset has the same name but different content.');
  }
}

async function readManifest(path) {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new TikzRuntimeError('SYMLINK_ESCAPE', 'The asset manifest must be a regular file.');
    }
    if (metadata.size > MAX_MANIFEST_BYTES) {
      throw new TikzRuntimeError('MANIFEST_TOO_LARGE', 'The asset manifest exceeds the safety limit.');
    }
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected an object');
    if (parsed.assets !== undefined && !Array.isArray(parsed.assets)) throw new Error('assets must be an array');
    return parsed;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return { version: 1, assets: [] };
    if (error instanceof TikzRuntimeError) throw error;
    throw new TikzRuntimeError('MANIFEST_INVALID', 'The existing asset manifest is invalid JSON.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

async function writeManifestAtomically(path, manifest) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function mergeAsset(existingAssets, incoming) {
  const assets = existingAssets.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  const index = assets.findIndex((item) => item.sha256 === incoming.sha256);
  if (index === -1) return [...assets, incoming];

  const previous = assets[index];
  const nodeIds = [...new Set([
    ...(Array.isArray(previous.nodeIds) ? previous.nodeIds.filter((item) => typeof item === 'string') : []),
    ...incoming.nodeIds,
  ])];
  const provenance = [
    ...(Array.isArray(previous.provenance) ? previous.provenance : []),
    ...incoming.provenance,
  ];
  assets[index] = {
    ...previous,
    ...incoming,
    nodeIds,
    prompt: previous.prompt ?? incoming.prompt,
    provenance,
  };
  return assets;
}

export async function prepareAsset(input = {}, options = {}) {
  const projectRoot = await resolveProjectRoot(input.projectRoot);
  const inputPath = await resolveInputImage(projectRoot, input.inputPath);
  const outputDirectory = normalizeRelativePath(
    input.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY,
    'outputDirectory',
  );
  const nodeId = optionalText(input.nodeId, 'nodeId', 160);
  const prompt = optionalText(input.prompt, 'prompt', 8_000);
  const provider = optionalText(input.provider, 'provider', 160);
  const model = optionalText(input.model, 'model', 160);
  const processor = options.processor ?? imageMagickImageProcessor;

  const sourceBuffer = await readBoundedSource(inputPath, {
    ...options.sourceRead,
    signal: options.signal,
  });
  const normalized = await processor.normalize(sourceBuffer, { signal: options.signal });
  if (!normalized || !Buffer.isBuffer(normalized.buffer)) {
    throw new TikzRuntimeError('IMAGE_NORMALIZATION_FAILED', 'The image processor returned no PNG buffer.');
  }
  if (normalized.output?.format !== 'png') {
    throw new TikzRuntimeError('IMAGE_NORMALIZATION_FAILED', 'The image processor did not return PNG output.');
  }
  if (normalized.buffer.length > MAX_INPUT_BYTES) {
    throw new TikzRuntimeError('IMAGE_TOO_LARGE', 'The normalized PNG exceeds the 25 MiB safety limit.');
  }

  const sha256 = createHash('sha256').update(normalized.buffer).digest('hex');
  const directory = await ensureProjectDirectory(projectRoot, outputDirectory, 'outputDirectory');
  const assetRelativePath = `${directory.normalized}/${sha256}.png`;
  const assetTarget = await assertWritableProjectFile(projectRoot, assetRelativePath, 'asset path');
  await writeContentAddressedFile(assetTarget.path, normalized.buffer);

  const manifestRelativePath = `${directory.normalized}/${MANIFEST_NAME}`;
  const manifestTarget = await assertWritableProjectFile(projectRoot, manifestRelativePath, 'manifest path');
  const existingManifest = await readManifest(manifestTarget.path);
  const importedAt = (options.now ?? (() => new Date().toISOString()))();
  const provenanceEntry = {
    kind: provider || model || prompt ? 'generated-image' : 'imported-image',
    provider: provider ?? null,
    model: model ?? null,
    importedAt,
  };
  const asset = {
    sha256,
    relativePath: assetRelativePath,
    bytes: normalized.buffer.length,
    inputFormat: normalized.input?.format ?? null,
    inputWidth: normalized.input?.width ?? null,
    inputHeight: normalized.input?.height ?? null,
    outputFormat: 'png',
    outputWidth: normalized.output?.width ?? null,
    outputHeight: normalized.output?.height ?? null,
    nodeIds: nodeId ? [nodeId] : [],
    prompt,
    provenance: [provenanceEntry],
  };
  const manifest = {
    ...existingManifest,
    version: 1,
    assets: mergeAsset(existingManifest.assets ?? [], asset),
  };
  await writeManifestAtomically(manifestTarget.path, manifest);

  return {
    ok: true,
    asset: manifest.assets.find((item) => item.sha256 === sha256),
    manifest: {
      relativePath: manifestRelativePath,
      assetCount: manifest.assets.length,
    },
    operations: {
      networkAccess: false,
      imageGeneration: false,
      normalizedWith: 'imagemagick',
      command: normalized.evidence ?? null,
    },
  };
}

export { DEFAULT_OUTPUT_DIRECTORY, MANIFEST_NAME };
