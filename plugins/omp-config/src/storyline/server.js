// Loopback-only HTTP server for one storyline workbench project.
//
// Static files come from the plugin's own assets directory; every write goes
// through the single-writer store for the current project. The server binds
// 127.0.0.1 only and authenticates every /api request with a per-session token.

import { createServer } from 'node:http';
import { open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import {
  ASSET_TYPES,
  MAX_ASSET_BYTES,
  MAX_JSON_BYTES,
  StorylineError,
  applyTreeUpdate,
  createComment,
  createRound,
  decideProposal,
  detectAssetMime,
  importProposal,
  proposalComparison,
  proposalIsStale,
  sanitizeFilename,
  updateComment,
} from './model.js';
import { buildExportFiles } from './export.js';
import { openStoryStore, storylinePaths } from './store.js';

const STATIC_FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/copy.zh.js': ['copy.zh.js', 'text/javascript; charset=utf-8'],
  '/vendor/markdown-it/markdown-it.min.js': ['vendor/markdown-it/markdown-it.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/katex/katex.min.js': ['vendor/katex/katex.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/katex/katex.min.css': ['vendor/katex/katex.min.css', 'text/css; charset=utf-8'],
  '/vendor/manifest.json': ['vendor/manifest.json', 'application/json; charset=utf-8'],
});
const FONT_PATTERN = /^\/vendor\/katex\/fonts\/([A-Za-z0-9_-]{1,64}\.(?:woff2|woff|ttf))$/u;
const FONT_TYPES = Object.freeze({
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
});
const SAFE_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '[::1]']);

function pluginAssetRoot(pluginRoot) {
  return path.join(pluginRoot, 'assets', 'storyline-workbench');
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    return null;
  }
}

async function acquireLock({ paths, logger }) {
  const attempt = async () => {
    try {
      const handle = await open(paths.lock, 'wx', 0o644);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, 'utf8');
      await handle.close();
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      return false;
    }
  };

  if (await attempt()) return;

  let raw;
  try {
    raw = await readFile(paths.lock, 'utf8');
  } catch {
    throw new StorylineError('LOCK_UNREADABLE', `another server may be using ${paths.lock} and the lock cannot be read`, { status: 409 });
  }
  let recorded = null;
  try {
    recorded = JSON.parse(raw);
  } catch {
    recorded = null;
  }
  const pid = Number.isInteger(recorded?.pid) ? recorded.pid : null;
  const alive = isProcessAlive(pid);
  if (alive === null) {
    throw new StorylineError('LOCK_UNREADABLE', `cannot tell whether the process holding ${paths.lock} is alive`, { status: 409 });
  }
  if (alive) {
    throw new StorylineError(
      'SERVER_ALREADY_RUNNING',
      `another storyline server is already running for this project (pid ${pid})`,
      { status: 409, pid },
    );
  }
  logger?.(`Reclaiming stale lock left by pid ${pid}`);
  await rm(paths.lock, { force: true });
  if (!(await attempt())) {
    throw new StorylineError('SERVER_ALREADY_RUNNING', 'another storyline server started while the stale lock was reclaimed', { status: 409 });
  }
}

function sendJson(response, status, payload, extraHeaders = {}) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  response.end(body);
}

function sendError(response, status, code, message, extra = {}) {
  sendJson(response, status, { error: { code, message }, ...extra });
}

function statusForError(error) {
  if (error instanceof StorylineError && Number.isInteger(error.details?.status)) return error.details.status;
  return 500;
}

function payloadForError(error) {
  const status = statusForError(error);
  const code = error instanceof StorylineError ? error.code : 'INTERNAL';
  const message = error instanceof StorylineError ? error.message : 'internal error';
  const extra = {};
  if (Number.isInteger(error?.details?.revision)) extra.revision = error.details.revision;
  return { status, code, message, extra };
}

// A body over the limit is drained and discarded before the 413 is sent, so
// the client can always read the response instead of stalling on a full
// socket that the server stopped reading.
async function readBody(request, limit) {
  const chunks = [];
  let total = 0;
  let overflow = false;
  for await (const chunk of request) {
    if (overflow) continue;
    total += chunk.length;
    if (total > limit) {
      overflow = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(chunk);
  }
  if (overflow) {
    throw new StorylineError('PAYLOAD_TOO_LARGE', `request body exceeds ${limit} bytes`, { status: 413 });
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const buffer = await readBody(request, MAX_JSON_BYTES);
  if (buffer.length === 0) {
    throw new StorylineError('EMPTY_BODY', 'request body must be JSON', { status: 400 });
  }
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new StorylineError('INVALID_JSON', `request body is not valid JSON: ${error.message}`, { status: 400 });
  }
}

function requirePlainObject(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new StorylineError('INVALID_BODY', 'request body must be a JSON object', { status: 400 });
  }
  return body;
}

function requireRevision(body) {
  if (!Number.isInteger(body.expectedRevision)) {
    throw new StorylineError('INVALID_EXPECTED_REVISION', 'expectedRevision is required and must be an integer', { status: 400 });
  }
  return body.expectedRevision;
}

function rejectUnknownKeys(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new StorylineError('UNKNOWN_FIELD', `request has unknown fields: ${unknown.join(', ')}`, { status: 400 });
  }
}

export async function startStorylineServer({
  projectDir,
  port = 0,
  pluginRoot,
  logger = null,
  host = '127.0.0.1',
} = {}) {
  if (!pluginRoot) {
    throw new StorylineError('PLUGIN_ROOT_REQUIRED', 'the plugin root is required to serve static assets', { status: 500 });
  }
  const store = await openStoryStore(projectDir);
  await acquireLock({ paths: store.paths, logger });
  const assetsRoot = await realpath(pluginAssetRoot(pluginRoot)).catch(() => null);
  if (!assetsRoot) {
    await rm(store.paths.lock, { force: true });
    throw new StorylineError('ASSETS_MISSING', `workbench assets not found under ${pluginAssetRoot(pluginRoot)}`, { status: 500 });
  }
  const story = await store.read();
  const token = randomBytes(32).toString('hex');
  let boundPort = port;
  let closed = false;

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const { status, code, message, extra } = payloadForError(error);
      sendError(response, status, code, message, extra);
    }
  });

  async function handleRequest(request, response) {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
    const hostHeader = String(request.headers.host ?? '');
    if (!hostMatches(hostHeader, boundPort)) {
      sendError(response, 403, 'HOST_NOT_ALLOWED', `requests must be addressed to ${host}:${boundPort}`);
      return;
    }
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET');
    if (mutation) {
      const origin = request.headers.origin;
      if (origin !== undefined && !originMatches(origin, boundPort)) {
        sendError(response, 403, 'ORIGIN_NOT_ALLOWED', 'cross-origin requests are not accepted');
        return;
      }
    }
    if (url.pathname.startsWith('/api/')) {
      const authorization = String(request.headers.authorization ?? '');
      if (authorization !== `Bearer ${token}`) {
        sendError(response, 403, 'UNAUTHORIZED', 'missing or invalid bearer token');
        return;
      }
      await handleApi({ request, response, url });
      return;
    }
    if (mutation) {
      sendError(response, 405, 'METHOD_NOT_ALLOWED', 'static assets are read-only');
      return;
    }
    await serveStatic({ request, response, url });
  }

  function hostMatches(header, activePort) {
    if (header === '') return false;
    const lowered = header.toLowerCase();
    for (const candidate of SAFE_HOSTS) {
      if (lowered === `${candidate}:${activePort}`) return true;
    }
    return false;
  }

  function originMatches(origin, activePort) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:') return false;
      if (!SAFE_HOSTS.includes(parsed.hostname)) return false;
      return parsed.port === String(activePort);
    } catch {
      return false;
    }
  }

  async function serveStatic({ response, url }) {
    const fontMatch = FONT_PATTERN.exec(url.pathname);
    const entry = STATIC_FILES[url.pathname];
    const relative = fontMatch ? `vendor/katex/fonts/${fontMatch[1]}` : entry?.[0];
    if (!relative) {
      sendError(response, 404, 'NOT_FOUND', 'unknown resource');
      return;
    }
    const contentType = fontMatch
      ? FONT_TYPES[path.extname(fontMatch[1]).slice(1)]
      : entry[1];
    const target = path.join(assetsRoot, relative);
    const safe = await realpath(target).catch(() => null);
    if (!safe || !(safe === assetsRoot || safe.startsWith(`${assetsRoot}${path.sep}`))) {
      sendError(response, 404, 'NOT_FOUND', 'unknown resource');
      return;
    }
    const info = await stat(safe).catch(() => null);
    if (!info?.isFile()) {
      sendError(response, 404, 'NOT_FOUND', 'unknown resource');
      return;
    }
    const body = await readFile(safe);
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
  }

  async function handleApi({ request, response, url }) {
    const method = request.method ?? 'GET';
    const route = url.pathname;

    if (method === 'GET' && route === '/api/story') {
      const current = await store.read();
      sendJson(response, 200, current);
      return;
    }

    if (method === 'PUT' && route === '/api/tree') {
      const body = requirePlainObject(await readJsonBody(request));
      rejectUnknownKeys(body, ['expectedRevision', 'nodes']);
      if (!Array.isArray(body.nodes)) {
        throw new StorylineError('INVALID_BODY', 'nodes must be an array', { status: 400 });
      }
      const outcome = await store.mutate({
        expectedRevision: requireRevision(body),
        apply: (current) => applyTreeUpdate({ story: current, nodes: body.nodes }),
      });
      sendJson(response, 200, { story: outcome.story });
      return;
    }

    if (method === 'POST' && route === '/api/comments') {
      const body = requirePlainObject(await readJsonBody(request));
      rejectUnknownKeys(body, ['expectedRevision', 'nodeId', 'body']);
      const outcome = await store.mutate({
        expectedRevision: requireRevision(body),
        apply: (current) => createComment({ story: current, nodeId: body.nodeId, body: body.body }),
      });
      sendJson(response, 200, { story: outcome.story, comment: outcome.outcome.comment });
      return;
    }

    const commentMatch = /^\/api\/comments\/([^/]+)$/u.exec(route);
    if (method === 'PATCH' && commentMatch) {
      const body = requirePlainObject(await readJsonBody(request));
      rejectUnknownKeys(body, ['expectedRevision', 'body', 'status']);
      const commentId = decodeURIComponent(commentMatch[1]);
      const outcome = await store.mutate({
        expectedRevision: requireRevision(body),
        apply: (current) => {
          const result = updateComment({
            story: current,
            commentId,
            body: body.body,
            status: body.status,
          });
          if (!result.ok) {
            throw new StorylineError(result.errors[0].code, result.errors[0].message, { status: 404 });
          }
          return result;
        },
      });
      sendJson(response, 200, { story: outcome.story });
      return;
    }

    if (method === 'POST' && route === '/api/assets') {
      const filename = sanitizeFilename(url.searchParams.get('filename') ?? 'upload');
      const buffer = await readBody(request, MAX_ASSET_BYTES);
      const declared = String(request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      const detected = detectAssetMime(buffer);
      if (!detected || !ASSET_TYPES[detected]) {
        throw new StorylineError('INVALID_ASSET_TYPE', 'only PNG, JPEG, WebP, GIF, and SVG images are accepted', { status: 400 });
      }
      if (declared !== '' && declared !== detected) {
        throw new StorylineError('ASSET_TYPE_MISMATCH', `declared ${declared} but the bytes are ${detected}`, { status: 400 });
      }
      const id = randomBytes(16).toString('hex');
      const storedName = `${id}.${ASSET_TYPES[detected]}`;
      await store.writeAsset({ id, mime: detected, buffer, storedName });
      let asset = null;
      try {
        const outcome = await store.mutate({
          apply: (current) => {
            asset = { id, filename, mime: detected, size: buffer.length, storedName };
            return { ok: true, story: { ...current, assets: [...current.assets, asset] } };
          },
        });
        sendJson(response, 200, { story: outcome.story, asset });
      } catch (error) {
        await rm(path.join(store.paths.assets, storedName), { force: true });
        throw error;
      }
      return;
    }

    const assetMatch = /^\/api\/assets\/([^/]+)$/u.exec(route);
    if (method === 'GET' && assetMatch) {
      const assetId = decodeURIComponent(assetMatch[1]);
      const current = await store.read();
      const asset = current.assets.find((entry) => entry.id === assetId);
      if (!asset) {
        sendError(response, 404, 'UNKNOWN_ASSET', 'unknown asset');
        return;
      }
      const body = await store.readAssetBuffer(asset.storedName);
      const headers = {
        'Content-Type': asset.mime,
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      };
      if (asset.mime === 'image/svg+xml') {
        headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
      }
      response.writeHead(200, headers);
      response.end(body);
      return;
    }

    if (method === 'POST' && route === '/api/rounds') {
      const body = requirePlainObject(await readJsonBody(request));
      rejectUnknownKeys(body, ['expectedRevision']);
      const outcome = await store.mutate({
        expectedRevision: requireRevision(body),
        apply: (current) => createRound({ story: current }),
      });
      sendJson(response, 200, { story: outcome.story, round: outcome.outcome.round, projectDir: store.paths.projectDir });
      return;
    }

    const roundMatch = /^\/api\/rounds\/([^/]+)$/u.exec(route);
    if (method === 'GET' && roundMatch) {
      const roundId = decodeURIComponent(roundMatch[1]);
      const current = await store.read();
      const round = current.rounds.find((entry) => entry.id === roundId);
      if (!round) {
        sendError(response, 404, 'UNKNOWN_ROUND', 'unknown round');
        return;
      }
      sendJson(response, 200, round);
      return;
    }

    if (method === 'POST' && route === '/api/proposals') {
      const body = requirePlainObject(await readJsonBody(request));
      const outcome = await store.mutate({
        expectedRevision: undefined,
        apply: (current) => importProposal({ story: current, proposal: body }),
      });
      const importOutcome = outcome.outcome;
      const round = outcome.story.rounds.find((entry) => entry.id === importOutcome.proposal.roundId);
      sendJson(response, 200, {
        story: outcome.story,
        proposal: importOutcome.proposal,
        comparison: proposalComparison({ round, proposal: importOutcome.proposal }),
        stale: proposalIsStale({ story: outcome.story, proposal: importOutcome.proposal }),
      });
      return;
    }

    const decisionMatch = /^\/api\/proposals\/([^/]+)\/decision$/u.exec(route);
    if (method === 'POST' && decisionMatch) {
      const body = requirePlainObject(await readJsonBody(request));
      rejectUnknownKeys(body, ['expectedRevision', 'decision']);
      const proposalId = decodeURIComponent(decisionMatch[1]);
      let decidedProposal = null;
      const outcome = await store.mutate({
        expectedRevision: requireRevision(body),
        apply: (current) => {
          const result = decideProposal({ story: current, proposalId, decision: body.decision });
          if (result.ok) {
            decidedProposal = result.story.proposals.find((entry) => entry.id === proposalId) ?? null;
          }
          return result;
        },
      });
      const round = decidedProposal
        ? outcome.story.rounds.find((entry) => entry.id === decidedProposal.roundId)
        : null;
      sendJson(response, 200, {
        story: outcome.story,
        proposal: decidedProposal,
        comparison: decidedProposal && body.decision === 'accept'
          ? proposalComparison({ round, proposal: decidedProposal })
          : null,
      });
      return;
    }

    if (method === 'POST' && route === '/api/exports') {
      const body = requirePlainObject(await readJsonBody(request));
      rejectUnknownKeys(body, ['expectedRevision']);
      const outcome = await store.mutate({
        expectedRevision: requireRevision(body),
        apply: (current) => ({ ok: true, story: current }),
      });
      const snapshot = outcome.story;
      const written = await store.run(async () => {
        const exists = await store.exportExists(snapshot.revision);
        if (exists) {
          const existing = await store.readExport(snapshot.revision);
          return { ...existing, reused: true };
        }
        const files = buildExportFiles(snapshot, { generatedAt: new Date().toISOString() });
        return store.writeExport({ revision: snapshot.revision, files });
      });
      sendJson(response, 200, {
        story: outcome.story,
        projectDir: store.paths.projectDir,
        export: {
          revision: snapshot.revision,
          directory: written.directory,
          relativeDirectory: path.relative(store.paths.projectDir, written.directory),
          files: written.files,
          reused: written.reused === true,
        },
      });
      return;
    }

    sendError(response, 404, 'NOT_FOUND', `unknown route ${route}`);
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      boundPort = typeof address === 'object' && address ? address.port : port;
      resolve();
    });
  });

  const url = `http://${host}:${boundPort}/#token=${token}`;
  await writeFile(
    store.paths.runtime,
    `${JSON.stringify({ url, token, pid: process.pid, projectDir: store.paths.projectDir, projectId: story.projectId, startedAt: new Date().toISOString() }, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );

  async function close() {
    if (closed) return;
    closed = true;
    const runtime = await readFile(store.paths.runtime, 'utf8').catch(() => null);
    if (runtime) {
      try {
        const parsed = JSON.parse(runtime);
        if (parsed.pid === process.pid) await rm(store.paths.runtime, { force: true });
      } catch {
        // Leave an unreadable runtime file in place rather than deleting another server's record.
      }
    }
    const lock = await readFile(store.paths.lock, 'utf8').catch(() => null);
    if (lock) {
      try {
        const parsed = JSON.parse(lock);
        if (parsed.pid === process.pid) await rm(store.paths.lock, { force: true });
      } catch {
        // Keep unreadable locks; the next start reports them instead of guessing.
      }
    }
    await new Promise((resolve) => {
      server.close(() => resolve());
      // Keep-alive sockets from the page would otherwise hold the close open.
      server.closeAllConnections?.();
    });
  }

  return {
    url,
    token,
    port: boundPort,
    host,
    projectDir: store.paths.projectDir,
    paths: store.paths,
    store,
    close,
  };
}

export async function readRuntime(projectDir) {
  const paths = storylinePaths(path.resolve(projectDir));
  let raw;
  try {
    raw = await readFile(paths.runtime, 'utf8');
  } catch {
    throw new StorylineError('SERVER_NOT_RUNNING', 'no storyline server is running for this project', { status: 409 });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StorylineError('SERVER_NOT_RUNNING', 'the runtime record is unreadable; start the server again', { status: 409 });
  }
  if (!isProcessAlive(parsed.pid)) {
    throw new StorylineError('SERVER_NOT_RUNNING', 'the recorded server process is gone; start the server again', { status: 409 });
  }
  return parsed;
}
