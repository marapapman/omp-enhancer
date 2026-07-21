import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeRelativePath, pathIsInside } from './path-policy.js';
import { TikzRuntimeError } from './runtime-error.js';

const BUNDLED_VENDOR_ROOT = fileURLToPath(new URL('../vendor/opentikz/', import.meta.url));
const BUNDLED_CATALOG_PATH = fileURLToPath(new URL('../vendor/opentikz/catalog.json', import.meta.url));
const VALID_TYPES = new Set(['icon', 'template', 'example']);
const MAX_LIMIT = 50;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_METADATA_BYTES = 512 * 1024;

function normalizeWords(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'query must be a string.');
  }
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}

function normalizeOptionalFilter(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new TikzRuntimeError('INVALID_PARAMETER', `${label} must be a string.`);
  }
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (normalized === '') return undefined;
  return normalized;
}

function normalizeLimit(value) {
  if (value === undefined || value === null) return 20;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'limit must be a positive integer.');
  }
  return Math.min(value, MAX_LIMIT);
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function scoreItem(item, queryTokens) {
  if (queryTokens.length === 0) return 1;
  const id = typeof item.id === 'string' ? item.id.toLocaleLowerCase('en-US') : '';
  const name = typeof item.name === 'string' ? item.name.toLocaleLowerCase('en-US') : '';
  const tags = stringArray(item.tags).join(' ').toLocaleLowerCase('en-US');
  const description = typeof item.description === 'string'
    ? item.description.toLocaleLowerCase('en-US')
    : '';
  let score = 0;
  for (const token of queryTokens) {
    if (id === token) score += 12;
    else if (id.includes(token)) score += 8;
    if (name.includes(token)) score += 6;
    if (tags.includes(token)) score += 4;
    if (description.includes(token)) score += 2;
  }
  return score;
}

function safeCatalogItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  if (typeof item.id !== 'string' || typeof item.type !== 'string' || typeof item.path !== 'string') {
    return undefined;
  }
  let path;
  try {
    path = normalizeRelativePath(item.path, `catalog path for ${item.id}`);
  } catch {
    return undefined;
  }
  let preview;
  if (typeof item.preview === 'string' && item.preview.trim() !== '') {
    try {
      preview = normalizeRelativePath(`${path}/${item.preview}`, `catalog preview for ${item.id}`);
    } catch {
      return undefined;
    }
  }
  return {
    id: item.id,
    name: typeof item.name === 'string' ? item.name : item.id,
    type: item.type,
    domain: stringArray(item.domain),
    tags: stringArray(item.tags),
    description: typeof item.description === 'string' ? item.description : '',
    path,
    previewRelativePath: preview,
    license: typeof item.license === 'string' ? item.license : undefined,
    requires: stringArray(item.requires),
    venue: stringArray(item.venue),
  };
}

function materialNames(item) {
  if (item.type === 'template') return { source: 'template.tex', metadata: 'template.meta.json' };
  if (item.type === 'example') return { source: 'figure.tex', metadata: 'figure.meta.json' };
  if (item.type === 'icon') return { source: `${item.id}.tex`, metadata: `${item.id}.meta.json` };
  throw new TikzRuntimeError('CATALOG_INVALID', `Unsupported catalog type for ${item.id}.`);
}

async function containedFile(vendorRoot, relativePath, label) {
  const lexical = resolve(vendorRoot, relativePath);
  if (!pathIsInside(vendorRoot, lexical)) {
    throw new TikzRuntimeError('CATALOG_INVALID', `${label} escapes the bundled vendor root.`);
  }
  let resolved;
  try {
    resolved = await realpath(lexical);
  } catch (error) {
    throw new TikzRuntimeError('CATALOG_INVALID', `${label} is missing from the bundled snapshot.`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!pathIsInside(vendorRoot, resolved)) {
    throw new TikzRuntimeError('CATALOG_INVALID', `${label} resolves outside the bundled vendor root.`);
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile()) throw new TikzRuntimeError('CATALOG_INVALID', `${label} is not a regular file.`);
  return { path: resolved, bytes: metadata.size };
}

async function boundedText(file, maximumBytes, label) {
  if (file.bytes > maximumBytes) {
    throw new TikzRuntimeError('CATALOG_RESOURCE_TOO_LARGE', `${label} exceeds the packaged read limit.`, {
      bytes: file.bytes,
      maximumBytes,
    });
  }
  return readFile(file.path, 'utf8');
}

async function hydrateItem(item, vendorRoot, includeSource) {
  const names = materialNames(item);
  const source = await containedFile(vendorRoot, `${item.path}/${names.source}`, `${item.id} source`);
  const metadata = await containedFile(vendorRoot, `${item.path}/${names.metadata}`, `${item.id} metadata`);
  const preview = item.previewRelativePath
    ? await containedFile(vendorRoot, item.previewRelativePath, `${item.id} preview`)
    : undefined;
  const hydrated = {
    ...item,
    sourcePath: source.path,
    metadataPath: metadata.path,
    previewPath: preview?.path ?? null,
  };
  delete hydrated.previewRelativePath;
  if (includeSource) {
    hydrated.sourceContent = await boundedText(source, MAX_SOURCE_BYTES, `${item.id} source`);
    hydrated.metadataContent = await boundedText(metadata, MAX_METADATA_BYTES, `${item.id} metadata`);
  }
  return hydrated;
}

export async function searchCatalog(input = {}, options = {}) {
  const query = normalizeWords(input.query);
  const type = normalizeOptionalFilter(input.type, 'type');
  if (type && !VALID_TYPES.has(type)) {
    throw new TikzRuntimeError('INVALID_PARAMETER', `type must be one of: ${[...VALID_TYPES].join(', ')}.`);
  }
  const domain = normalizeOptionalFilter(input.domain, 'domain');
  const limit = normalizeLimit(input.limit);
  const catalogPath = options.catalogPath ?? BUNDLED_CATALOG_PATH;
  if (input.includeSource !== undefined && typeof input.includeSource !== 'boolean') {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'includeSource must be a boolean.');
  }
  const includeSource = input.includeSource === true;
  let vendorRoot;
  try {
    vendorRoot = await realpath(options.vendorRoot ?? BUNDLED_VENDOR_ROOT);
  } catch (error) {
    throw new TikzRuntimeError('CATALOG_READ_FAILED', 'Unable to resolve the bundled OpenTikZ root.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(catalogPath, 'utf8'));
  } catch (error) {
    throw new TikzRuntimeError('CATALOG_READ_FAILED', 'Unable to read the bundled OpenTikZ catalog.', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!Array.isArray(parsed)) {
    throw new TikzRuntimeError('CATALOG_INVALID', 'The bundled OpenTikZ catalog must be an array.');
  }

  const queryTokens = query === '' ? [] : query.split(' ');
  let excludedUnsafeEntries = 0;
  const matches = [];
  for (const rawItem of parsed) {
    const item = safeCatalogItem(rawItem);
    if (!item) {
      excludedUnsafeEntries += 1;
      continue;
    }
    if (type && item.type.toLocaleLowerCase('en-US') !== type) continue;
    if (domain && !item.domain.some((entry) => entry.toLocaleLowerCase('en-US') === domain)) continue;
    const score = scoreItem(item, queryTokens);
    if (score === 0) continue;
    matches.push({ item, score });
  }
  matches.sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));

  const items = [];
  for (const { item } of matches.slice(0, limit)) {
    try {
      items.push(await hydrateItem(item, vendorRoot, includeSource));
    } catch (error) {
      if (!(error instanceof TikzRuntimeError) || error.code !== 'CATALOG_INVALID') throw error;
      excludedUnsafeEntries += 1;
    }
  }

  return {
    ok: true,
    query,
    filters: { type: type ?? null, domain: domain ?? null },
    includeSource,
    limit,
    total: items.length,
    items,
    excludedUnsafeEntries,
    source: {
      kind: 'bundled-opentikz-catalog',
      mutable: false,
    },
  };
}

export { BUNDLED_CATALOG_PATH, BUNDLED_VENDOR_ROOT };
