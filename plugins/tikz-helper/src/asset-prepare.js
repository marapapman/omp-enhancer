import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { isAbsolute, win32 } from 'node:path';
import { tmpdir } from 'node:os';

import { sharpImageProcessor } from './image-processor.js';
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

async function readBoundedFile(path, maximumBytes, code) {
  const metadata = await stat(path);
  if (metadata.size > maximumBytes) {
    throw new TikzRuntimeError(code, `File exceeds the ${maximumBytes}-byte safety limit.`, {
      bytes: metadata.size,
      maximumBytes,
    });
  }
  return readFile(path);
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
  const processor = options.processor ?? sharpImageProcessor;

  const sourceBuffer = await readBoundedFile(inputPath, MAX_INPUT_BYTES, 'IMAGE_TOO_LARGE');
  const normalized = await processor.normalize(sourceBuffer);
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
      normalizedWith: 'sharp',
    },
  };
}

export { DEFAULT_OUTPUT_DIRECTORY, MANIFEST_NAME };
