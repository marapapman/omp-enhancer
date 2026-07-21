import {
  lstat,
  mkdir,
  realpath,
  stat,
} from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

import { TikzRuntimeError } from './runtime-error.js';

function isInside(root, candidate) {
  const offset = relative(root, candidate);
  return offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset));
}

function missing(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT';
}

export function normalizeRelativePath(value, label = 'path') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TikzRuntimeError('INVALID_PARAMETER', `${label} must be a non-empty project-relative path.`);
  }
  if (value.includes('\0')) {
    throw new TikzRuntimeError('INVALID_PARAMETER', `${label} contains a NUL byte.`);
  }

  const normalizedSeparators = value.trim().replaceAll('\\', '/');
  const segments = normalizedSeparators.split('/');
  if (
    normalizedSeparators.startsWith('~')
    || isAbsolute(normalizedSeparators)
    || win32.isAbsolute(normalizedSeparators)
    || segments.some((segment) => segment === '..')
  ) {
    throw new TikzRuntimeError('PATH_OUTSIDE_PROJECT', `${label} must stay inside the project root.`, {
      path: value,
    });
  }

  const clean = segments.filter((segment) => segment !== '' && segment !== '.').join('/');
  if (clean === '') {
    throw new TikzRuntimeError('INVALID_PARAMETER', `${label} must identify a file or directory.`);
  }
  return clean;
}

export async function resolveProjectRoot(projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new TikzRuntimeError('INVALID_PARAMETER', 'A project root is required.');
  }
  let root;
  try {
    root = await realpath(projectRoot);
    const metadata = await stat(root);
    if (!metadata.isDirectory()) throw new Error('not a directory');
  } catch (error) {
    throw new TikzRuntimeError('INVALID_PROJECT_ROOT', `Project root is not an existing directory: ${projectRoot}`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  return root;
}

export async function resolveExistingProjectFile(projectRoot, relativePath, label = 'path') {
  const root = await resolveProjectRoot(projectRoot);
  const normalized = normalizeRelativePath(relativePath, label);
  const lexicalPath = resolve(root, normalized);
  if (!isInside(root, lexicalPath)) {
    throw new TikzRuntimeError('PATH_OUTSIDE_PROJECT', `${label} escapes the project root.`, { path: relativePath });
  }

  let resolved;
  try {
    resolved = await realpath(lexicalPath);
  } catch (error) {
    if (missing(error)) {
      throw new TikzRuntimeError('FILE_NOT_FOUND', `${label} does not exist: ${normalized}`, { path: normalized });
    }
    throw error;
  }
  if (!isInside(root, resolved)) {
    throw new TikzRuntimeError('SYMLINK_ESCAPE', `${label} resolves outside the project root.`, {
      path: normalized,
    });
  }
  const metadata = await stat(resolved);
  if (!metadata.isFile()) {
    throw new TikzRuntimeError('INVALID_FILE', `${label} must identify a regular file.`, { path: normalized });
  }
  return { root, normalized, path: resolved };
}

export async function ensureProjectDirectory(projectRoot, relativePath, label = 'directory') {
  const root = await resolveProjectRoot(projectRoot);
  const normalized = normalizeRelativePath(relativePath, label);
  const segments = normalized.split('/');
  let current = root;

  for (const segment of segments) {
    current = resolve(current, segment);
    if (!isInside(root, current)) {
      throw new TikzRuntimeError('PATH_OUTSIDE_PROJECT', `${label} escapes the project root.`, {
        path: normalized,
      });
    }
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        const target = await realpath(current);
        if (!isInside(root, target)) {
          throw new TikzRuntimeError('SYMLINK_ESCAPE', `${label} resolves outside the project root.`, {
            path: normalized,
          });
        }
        current = target;
      } else if (!metadata.isDirectory()) {
        throw new TikzRuntimeError('INVALID_DIRECTORY', `${label} crosses a non-directory path.`, {
          path: normalized,
        });
      }
    } catch (error) {
      if (!missing(error)) throw error;
      await mkdir(current);
    }
  }

  const resolved = await realpath(current);
  if (!isInside(root, resolved)) {
    throw new TikzRuntimeError('SYMLINK_ESCAPE', `${label} resolves outside the project root.`, {
      path: normalized,
    });
  }
  return { root, normalized, path: resolved };
}

export async function assertWritableProjectFile(projectRoot, relativePath, label = 'path') {
  const normalized = normalizeRelativePath(relativePath, label);
  const slash = normalized.lastIndexOf('/');
  const directory = slash === -1 ? '.' : normalized.slice(0, slash);
  const name = slash === -1 ? normalized : normalized.slice(slash + 1);
  const directoryResult = directory === '.'
    ? { root: await resolveProjectRoot(projectRoot), normalized: '.', path: await resolveProjectRoot(projectRoot) }
    : await ensureProjectDirectory(projectRoot, directory, `${label} parent`);
  const candidate = resolve(directoryResult.path, name);
  if (!isInside(directoryResult.root, candidate)) {
    throw new TikzRuntimeError('PATH_OUTSIDE_PROJECT', `${label} escapes the project root.`, { path: normalized });
  }
  try {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink()) {
      throw new TikzRuntimeError('SYMLINK_ESCAPE', `${label} must not be a symbolic link.`, { path: normalized });
    }
    if (!metadata.isFile()) {
      throw new TikzRuntimeError('INVALID_FILE', `${label} must identify a regular file.`, { path: normalized });
    }
  } catch (error) {
    if (!missing(error)) throw error;
  }
  return { root: directoryResult.root, normalized, path: candidate };
}

export function pathIsInside(root, candidate) {
  return isInside(root, candidate);
}
