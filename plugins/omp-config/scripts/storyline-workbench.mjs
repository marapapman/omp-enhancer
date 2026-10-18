#!/usr/bin/env node
// CLI for the storyline workbench.
//
//   init    --project <dir> --kind article|slides [--title <text>]
//   serve   --project <dir> [--port <n>]
//   context --project <dir> --round <id>
//   propose --project <dir> --file <proposal.json>
//
// The plugin root is resolved from this file's own location so the command
// works from any install directory.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { StorylineError } from '../src/storyline/model.js';
import { readRuntime, startStorylineServer } from '../src/storyline/server.js';
import { initStoryProject, storylinePaths } from '../src/storyline/store.js';

const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const USAGE = `Usage:
  storyline-workbench init    --project <dir> --kind article|slides [--title <text>]
  storyline-workbench serve   --project <dir> [--port <n>]
  storyline-workbench context --project <dir> --round <id>
  storyline-workbench propose --project <dir> --file <proposal.json>`;

function parseArgs(argv) {
  const args = { positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args.positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function fail(message, code = 'USAGE') {
  const error = new StorylineError(code, message, { status: 2 });
  error.exitCode = 2;
  throw error;
}

function requireString(args, key) {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') fail(`--${key} is required\n\n${USAGE}`);
  return value;
}

function describeError(error) {
  if (error instanceof StorylineError) return `${error.code}: ${error.message}`;
  return error?.stack ?? String(error);
}

async function authorizedFetch(runtime, route, init = {}) {
  const target = new URL(route, runtime.url);
  const response = await fetch(target, {
    ...init,
    headers: {
      Authorization: `Bearer ${runtime.token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text === '' ? null : JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const code = payload?.error?.code ?? `HTTP_${response.status}`;
    const message = payload?.error?.message ?? text.slice(0, 200);
    throw new StorylineError(code, message, { status: response.status, revision: payload?.revision });
  }
  return payload;
}

async function withRuntime(projectDir, run) {
  let runtime;
  try {
    runtime = await readRuntime(projectDir);
  } catch (error) {
    if (error instanceof StorylineError && error.code === 'SERVER_NOT_RUNNING') {
      const paths = storylinePaths(path.resolve(projectDir));
      throw new StorylineError(
        'SERVER_NOT_RUNNING',
        `no storyline server is running for ${paths.projectDir}\nStart it with:\n  node ${path.join(pluginRoot, 'scripts', 'storyline-workbench.mjs')} serve --project ${path.resolve(projectDir)}`,
        { status: 1 },
      );
    }
    throw error;
  }
  return run(runtime);
}

async function commandInit(args) {
  const projectDir = requireString(args, 'project');
  const kind = requireString(args, 'kind');
  if (!['article', 'slides'].includes(kind)) fail(`--kind must be article or slides\n\n${USAGE}`);
  const title = typeof args.title === 'string' ? args.title : '';
  const result = await initStoryProject({ projectDir, kind, title });
  process.stdout.write(
    `${JSON.stringify(
      {
        created: result.created,
        projectDir: result.paths.projectDir,
        storyPath: result.paths.story,
        assetsDir: result.paths.assets,
        kind: result.story.kind,
        revision: result.story.revision,
        rootId: result.story.rootId,
        title: result.story.nodes.find((node) => node.id === result.story.rootId)?.title ?? '',
      },
      null,
      2,
    )}\n`,
  );
  return 0;
}

async function commandServe(args) {
  const projectDir = requireString(args, 'project');
  let port = 0;
  if (args.port !== undefined && args.port !== true) {
    port = Number.parseInt(String(args.port), 10);
    if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`--port must be an integer between 0 and 65535\n\n${USAGE}`);
  }
  const server = await startStorylineServer({
    projectDir,
    port,
    pluginRoot,
    logger: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`storyline workbench ready\nurl: ${server.url}\nproject: ${server.projectDir}\n`);
  process.stdout.write('Bind address is 127.0.0.1 only; from a remote machine forward the port with ssh -L.\n');

  const shutdown = async (signal) => {
    process.stdout.write(`\n${signal} received; stopping the workbench\n`);
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  return new Promise(() => {});
}

async function commandContext(args) {
  const projectDir = requireString(args, 'project');
  const roundId = requireString(args, 'round');
  const round = await withRuntime(projectDir, (runtime) =>
    authorizedFetch(runtime, `/api/rounds/${encodeURIComponent(roundId)}`),
  );
  process.stdout.write(`${JSON.stringify(round, null, 2)}\n`);
  return 0;
}

async function commandPropose(args) {
  const projectDir = requireString(args, 'project');
  const file = requireString(args, 'file');
  let raw;
  try {
    raw = await readFile(path.resolve(file), 'utf8');
  } catch (error) {
    fail(`cannot read proposal file ${path.resolve(file)}: ${error.message}`, 'PROPOSAL_FILE_UNREADABLE');
  }
  let proposal;
  try {
    proposal = JSON.parse(raw);
  } catch (error) {
    fail(`proposal file is not valid JSON: ${error.message}`, 'PROPOSAL_FILE_INVALID');
  }
  const result = await withRuntime(projectDir, (runtime) =>
    authorizedFetch(runtime, '/api/proposals', { method: 'POST', body: JSON.stringify(proposal) }),
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        proposalId: result?.proposal?.id ?? null,
        status: result?.proposal?.status ?? null,
        stale: result?.stale ?? false,
        comparison: result?.comparison ?? null,
        revision: result?.story?.revision ?? null,
      },
      null,
      2,
    )}\n`,
  );
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0] ?? (typeof args.command === 'string' ? args.command : undefined);
  switch (command) {
    case 'init':
      return commandInit(args);
    case 'serve':
      return commandServe(args);
    case 'context':
      return commandContext(args);
    case 'propose':
      return commandPropose(args);
    default:
      process.stderr.write(`${USAGE}\n`);
      return 2;
  }
}

main()
  .then((code) => {
    if (typeof code === 'number') process.exit(code);
  })
  .catch((error) => {
    process.stderr.write(`${describeError(error)}\n`);
    process.exit(error?.exitCode ?? 1);
  });
