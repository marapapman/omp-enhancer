// Atomic, single-writer persistence for one story project.
//
// Every mutation runs on one promise queue, is validated by model.js, and is
// committed by writing a temporary file in the same directory and renaming it
// over story.json. A failed write leaves the previous committed story intact.

import { constants as fsConstants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { SCHEMA_VERSION, StorylineError, canonicalStory, createStory, validateStory } from './model.js';

const STORYLINE_DIR = '.storyline';
const EXPORT_DIR = 'exports';

export function storylinePaths(projectDir) {
  const root = path.join(projectDir, STORYLINE_DIR);
  return {
    projectDir,
    root,
    story: path.join(root, 'story.json'),
    assets: path.join(root, 'assets'),
    exports: path.join(root, EXPORT_DIR),
    lock: path.join(root, 'server.lock'),
    runtime: path.join(root, 'runtime.json'),
  };
}

async function pathExists(candidate) {
  try {
    await access(candidate, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(candidate) {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function assertProjectDir(projectDir) {
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    throw new StorylineError('PROJECT_DIR_REQUIRED', 'a project directory is required');
  }
  const resolved = path.resolve(projectDir);
  if (!(await isDirectory(resolved))) {
    throw new StorylineError('PROJECT_DIR_MISSING', `project directory does not exist: ${resolved}`);
  }
  return resolved;
}

function parseStoryText(text, storyPath) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new StorylineError('STORY_CORRUPT', `story.json is not valid JSON: ${error.message}`, { path: storyPath });
  }
  if (parsed && typeof parsed === 'object' && parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new StorylineError(
      'UNSUPPORTED_SCHEMA',
      `story.json has unsupported schemaVersion ${String(parsed.schemaVersion)}; this workbench supports ${SCHEMA_VERSION}`,
      { path: storyPath },
    );
  }
  const validated = validateStory(parsed);
  if (!validated.ok) {
    throw new StorylineError('STORY_INVALID', 'story.json failed validation', {
      path: storyPath,
      errors: validated.errors,
    });
  }
  return validated.story;
}

async function writeJsonAtomic(targetPath, value) {
  const directory = path.dirname(targetPath);
  const temporary = path.join(directory, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(temporary, text, { encoding: 'utf8', mode: 0o644 });
  await rename(temporary, targetPath);
}

async function writeFileAtomic(targetPath, contents, mode = 0o644) {
  const directory = path.dirname(targetPath);
  const temporary = path.join(directory, `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, contents, { mode });
  await rename(temporary, targetPath);
}

export async function initStoryProject({ projectDir, kind, title = '' }) {
  const resolved = await assertProjectDir(projectDir);
  const paths = storylinePaths(resolved);
  // The store identity is a generated UUID: renaming the directory keeps the
  // same story identity, and two copies of a project stay distinguishable.
  const projectId = randomUUID();
  if (await pathExists(paths.story)) {
    const existing = parseStoryText(await readFile(paths.story, 'utf8'), paths.story);
    if (existing.kind !== kind) {
      throw new StorylineError(
        'KIND_MISMATCH',
        `existing story is kind ${existing.kind} and was left unchanged; requested ${kind}`,
        { path: paths.story },
      );
    }
    await mkdir(paths.assets, { recursive: true });
    return { created: false, paths, story: existing, projectId: existing.projectId };
  }
  await mkdir(paths.assets, { recursive: true });
  const story = createStory({ projectId, kind, title });
  await writeJsonAtomic(paths.story, story);
  return { created: true, paths, story, projectId };
}

export async function openStoryStore(projectDir) {
  const resolved = await assertProjectDir(projectDir);
  const paths = storylinePaths(resolved);
  if (!(await pathExists(paths.story))) {
    throw new StorylineError('STORY_MISSING', `no story at ${paths.story}; run the init command first`);
  }
  await mkdir(paths.assets, { recursive: true });
  let queue = Promise.resolve();
  let cached = null;

  async function load() {
    const text = await readFile(paths.story, 'utf8');
    return parseStoryText(text, paths.story);
  }

  function read() {
    return cached ?? load().then((story) => {
      cached = story;
      return story;
    });
  }

  async function persist(story) {
    const canonical = canonicalStory(story);
    await writeJsonAtomic(paths.story, canonical);
    cached = canonical;
    return canonical;
  }

  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function mutateUnsafe({ expectedRevision, apply }) {
    const current = await load();
    if (expectedRevision !== undefined) {
      if (!Number.isInteger(expectedRevision)) {
        throw new StorylineError('INVALID_EXPECTED_REVISION', 'expectedRevision must be an integer', { status: 400 });
      }
      if (expectedRevision !== current.revision) {
        throw new StorylineError('REVISION_CONFLICT', 'the story changed since this request was prepared', {
          revision: current.revision,
          status: 409,
        });
      }
    }
    const outcome = await apply(current);
    if (!outcome || typeof outcome !== 'object') {
      throw new StorylineError('INTERNAL', 'update produced no outcome', { status: 500 });
    }
    if (!outcome.ok) {
      const first = outcome.errors?.[0];
      throw new StorylineError(first?.code ?? 'INVALID_REQUEST', first?.message ?? 'request rejected', {
        status: first?.code === 'PROPOSAL_STALE' ? 409 : 400,
        errors: outcome.errors ?? [],
        ...(outcome.stale || first?.code === 'PROPOSAL_STALE' ? { revision: current.revision } : {}),
      });
    }
    const changed = JSON.stringify(canonicalStory(outcome.story)) !== JSON.stringify(current);
    const story = changed ? await persist(outcome.story) : current;
    return { story, outcome };
  }

  return {
    projectDir: resolved,
    paths,
    read,
    invalidate() {
      cached = null;
    },
    mutate({ expectedRevision, apply }) {
      return enqueue(() => mutateUnsafe({ expectedRevision, apply }));
    },
    run(task) {
      return enqueue(async () => task());
    },
    async writeAsset({ id, mime, buffer, storedName }) {
      const target = path.join(paths.assets, storedName);
      if (path.dirname(target) !== paths.assets) {
        throw new StorylineError('INVALID_STORED_NAME', 'asset name escapes the assets directory', { status: 400 });
      }
      await mkdir(paths.assets, { recursive: true });
      const existing = await lstat(target).catch(() => null);
      if (existing?.isSymbolicLink()) {
        throw new StorylineError('ASSET_PATH_UNSAFE', 'refusing to write through a symbolic link', { status: 400 });
      }
      try {
        await writeFileAtomic(target, buffer);
      } catch (error) {
        await rm(target, { force: true });
        throw new StorylineError('ASSET_WRITE_FAILED', `could not store asset: ${error.message}`, { status: 500 });
      }
      return { id, mime, storedName, path: target };
    },
    async readAssetBuffer(storedName) {
      const target = path.join(paths.assets, storedName);
      if (path.dirname(target) !== paths.assets) {
        throw new StorylineError('UNKNOWN_ASSET', 'unknown asset', { status: 404 });
      }
      const root = await realpath(paths.assets).catch(() => null);
      if (!root) throw new StorylineError('ASSET_MISSING', 'the assets directory is missing', { status: 404 });
      const resolved = await realpath(target).catch(() => null);
      if (!resolved) throw new StorylineError('ASSET_MISSING', 'asset file is missing from the project', { status: 404 });
      if (!resolved.startsWith(`${root}${path.sep}`)) {
        throw new StorylineError('ASSET_PATH_UNSAFE', 'asset file escapes the assets directory', { status: 404 });
      }
      try {
        return await readFile(resolved);
      } catch {
        throw new StorylineError('ASSET_MISSING', 'asset file is missing from the project', { status: 404 });
      }
    },
    async exportExists(revision) {
      const target = path.join(paths.exports, `r${revision}`);
      return isDirectory(target);
    },
    async readExport(revision) {
      const target = path.join(paths.exports, `r${revision}`);
      const entries = await readdir(target);
      return { directory: target, files: entries.sort() };
    },
    async writeExport({ revision, files }) {
      const target = path.join(paths.exports, `r${revision}`);
      if (await isDirectory(target)) {
        const existing = await readdir(target);
        return { directory: target, files: existing.sort(), reused: true };
      }
      await mkdir(paths.exports, { recursive: true });
      const staging = path.join(paths.exports, `.r${revision}.${process.pid}.${Date.now()}.tmp`);
      await mkdir(staging);
      try {
        for (const [name, contents] of Object.entries(files)) {
          const filePath = path.join(staging, name);
          if (path.dirname(filePath) !== staging) {
            throw new StorylineError('INVALID_EXPORT_NAME', `export name escapes the staging directory: ${name}`, { status: 500 });
          }
          const body = typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`;
          await writeFile(filePath, body, { encoding: 'utf8', mode: 0o644 });
        }
        try {
          await rename(staging, target);
        } catch (error) {
          if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') {
            await rm(staging, { recursive: true, force: true });
            const existing = await readdir(target);
            return { directory: target, files: existing.sort(), reused: true };
          }
          throw error;
        }
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        if (error instanceof StorylineError) throw error;
        throw new StorylineError('EXPORT_WRITE_FAILED', `could not write export: ${error.message}`, { status: 500 });
      }
      const written = await readdir(target);
      return { directory: target, files: written.sort(), reused: false };
    },
    async exclusiveOpen(lockPath) {
      const handle = await open(lockPath, 'wx', 0o644);
      return handle;
    },
  };
}
