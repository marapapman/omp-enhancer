import { strict as assert } from 'node:assert';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';
import { promisify } from 'node:util';

import { buildExportFiles, renderStoryMarkdown } from '../src/storyline/export.js';
import {
  StorylineError,
  applyTreeUpdate,
  createStory,
  validateStory,
} from '../src/storyline/model.js';
import { startStorylineServer } from '../src/storyline/server.js';
import { initStoryProject, openStoryStore, storylinePaths } from '../src/storyline/store.js';

const run = promisify(execFile);
const pluginRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(pluginRoot, 'scripts', 'storyline-workbench.mjs');
const cleanups = [];

after(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup().catch(() => {});
  }
});

async function makeProject({ kind = 'article', title = '缓存策略对响应时间的影响' } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'storyline-test-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const result = await initStoryProject({ projectDir: dir, kind, title });
  return { dir, ...result };
}

async function startServer(dir) {
  const server = await startStorylineServer({ projectDir: dir, port: 0, pluginRoot });
  cleanups.push(() => server.close());
  return server;
}

function httpClient(server) {
  const base = `http://127.0.0.1:${server.port}`;
  const authorization = `Bearer ${server.token}`;
  const call = async (route, { method = 'GET', body, headers = {}, raw } = {}) => {
    const init = { method, headers: { Authorization: authorization, ...headers }, cache: 'no-store' };
    if (raw !== undefined) init.body = raw;
    else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${route}`, init);
    const text = await response.text();
    let payload = null;
    if (text !== '') {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    return { status: response.status, body: payload, headers: response.headers, text };
  };
  return { base, call, authorization };
}

function assetIdOf(story, offset = 0) {
  return story.assets[offset]?.id;
}

async function hashFile(target) {
  return createHash('sha256').update(await readFile(target)).digest('hex');
}

const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000b4944415478da63fcff1f000303020001476f0c860000000049454e44ae426082',
  'hex',
);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');

function node(overrides) {
  return {
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    kind: overrides.kind ?? 'claim',
    position: overrides.position ?? 0,
    title: overrides.title ?? '',
    blocks: overrides.blocks ?? [],
    sources: overrides.sources ?? [],
  };
}

describe('storyline workbench store', () => {
  test('init creates one topic root and never resets an existing store', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'storyline-init-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    await assert.rejects(() => initStoryProject({ projectDir: path.join(dir, 'missing'), kind: 'article' }), (error) => {
      assert.equal(error.code, 'PROJECT_DIR_MISSING');
      return true;
    });

    const first = await initStoryProject({ projectDir: dir, kind: 'article', title: '主题一' });
    assert.equal(first.created, true);
    assert.match(first.story.projectId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u, 'the store identity is a generated UUID');
    assert.notEqual(first.story.projectId, path.basename(dir), 'identity does not follow the directory name');
    assert.equal(first.story.nodes.length, 1);
    assert.equal(first.story.nodes[0].kind, 'topic');
    assert.equal(first.story.nodes[0].parentId, null);
    assert.equal(first.story.nodes[0].revision, 1);
    assert.equal(first.story.revision, 0);
    assert.equal(first.story.nodes[0].title, '主题一');

    const again = await initStoryProject({ projectDir: dir, kind: 'article', title: '另一个主题' });
    assert.equal(again.created, false);
    assert.equal(again.story.rootId, first.story.rootId);
    assert.equal(again.story.projectId, first.story.projectId, 'the identity survives reopening');
    assert.equal(again.story.nodes[0].title, '主题一');

    const before = await readFile(storylinePaths(dir).story, 'utf8');
    await assert.rejects(() => initStoryProject({ projectDir: dir, kind: 'slides', title: '主题一' }), (error) => {
      assert.equal(error.code, 'KIND_MISMATCH');
      return true;
    });
    assert.equal(await readFile(storylinePaths(dir).story, 'utf8'), before);

    await writeFile(storylinePaths(dir).story, 'not json at all\n');
    const corrupt = await readFile(storylinePaths(dir).story, 'utf8');
    await assert.rejects(() => initStoryProject({ projectDir: dir, kind: 'article' }), (error) => {
      assert.equal(error.code, 'STORY_CORRUPT');
      return true;
    });
    assert.equal(await readFile(storylinePaths(dir).story, 'utf8'), corrupt);
  });

  test('a renamed directory keeps its identity and a legacy projectId still loads', async () => {
    const original = await mkdtemp(path.join(tmpdir(), 'storyline-rename-'));
    cleanups.push(() => rm(original, { recursive: true, force: true }));
    const first = await initStoryProject({ projectDir: original, kind: 'article', title: '可搬迁' });
    const renamed = `${original}-moved`;
    cleanups.push(() => rm(renamed, { recursive: true, force: true }));
    await rename(original, renamed);
    const reopened = await openStoryStore(renamed);
    assert.equal((await reopened.read()).projectId, first.story.projectId);

    // Stores written before the UUID rule carry another non-empty string.
    const target = storylinePaths(renamed).story;
    const story = JSON.parse(await readFile(target, 'utf8'));
    await writeFile(target, `${JSON.stringify({ ...story, projectId: 'legacy-name' }, null, 2)}\n`);
    const legacy = await openStoryStore(renamed);
    assert.equal((await legacy.read()).projectId, 'legacy-name');
    const validated = validateStory({ ...story, projectId: 'legacy-name' });
    assert.equal(validated.ok, true);
  });

  test('an unknown schemaVersion is refused and the file stays as it was', async () => {
    const { dir } = await makeProject();
    const target = storylinePaths(dir).story;
    const original = JSON.parse(await readFile(target, 'utf8'));
    const future = { ...original, schemaVersion: 2 };
    await writeFile(target, `${JSON.stringify(future)}\n`);
    const onDisk = await readFile(target, 'utf8');
    await assert.rejects(() => openStoryStore(dir).then((store) => store.read()), (error) => {
      assert.equal(error.code, 'UNSUPPORTED_SCHEMA');
      return true;
    });
    await assert.rejects(() => startStorylineServer({ projectDir: dir, port: 0, pluginRoot }), (error) => {
      assert.equal(error.code, 'UNSUPPORTED_SCHEMA');
      return true;
    });
    assert.equal(await readFile(target, 'utf8'), onDisk);
  });

  test('a tree with blocks, comments, and assets survives a store restart', async () => {
    const { dir } = await makeProject();
    const server = await startServer(dir);
    const client = httpClient(server);
    const story = (await client.call('/api/story')).body;
    const rootId = story.rootId;
    const claimOne = '11111111-1111-4111-8111-111111111111';
    const claimTwo = '22222222-2222-4222-8222-222222222222';
    const evidence = '33333333-3333-4333-8333-333333333333';
    const tree = [
      node({
        id: rootId,
        kind: 'topic',
        title: '缓存策略对响应时间的影响',
        blocks: [{ id: 'block-root', type: 'markdown', text: '根正文，含行内公式 $E=mc^2$。' }],
        sources: [{ label: '内部记录', url: '' }],
      }),
      node({ id: claimOne, parentId: rootId, position: 0, title: '命中率提升', blocks: [] }),
      node({
        id: claimTwo,
        parentId: rootId,
        position: 1,
        title: '容量上限决定拐点',
        blocks: [{ id: 'block-math', type: 'math', latex: '\\frac{a}{b}', display: true }],
      }),
      node({
        id: evidence,
        parentId: claimOne,
        position: 0,
        title: '压测数据',
        blocks: [
          { id: 'block-table', type: 'table', columns: ['指标', '数值|备注'], rows: [['P99', '120 ms\n原值']], caption: '夹具' },
          { id: 'block-text', type: 'markdown', text: '行内 $a_b$ 与反斜杠 \\\\ 保留。' },
        ],
        sources: [{ label: '压测报告', url: 'https://example.com/report' }],
      }),
    ];
    const put = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision: story.revision, nodes: tree } });
    assert.equal(put.status, 200);
    assert.equal(put.body.story.revision, 1);
    assert.deepEqual(put.body.story.nodes.map((entry) => entry.revision), [2, 1, 1, 1]);
    const comment = await client.call('/api/comments', {
      method: 'POST',
      body: { expectedRevision: 1, nodeId: evidence, body: '把单位改成毫秒并保留数据值' },
    });
    assert.equal(comment.status, 200);
    assert.equal(comment.body.comment.nodeRevision, 1);
    assert.equal(comment.body.story.revision, 2);

    // Move the second claim above the first one; only those two nodes change revision.
    const reordered = put.body.story.nodes.map((entry) => {
      if (entry.id === claimOne) return { ...entry, position: 1 };
      if (entry.id === claimTwo) return { ...entry, position: 0 };
      return entry;
    });
    const moved = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision: 2, nodes: reordered } });
    assert.equal(moved.status, 200);
    const revisions = Object.fromEntries(moved.body.story.nodes.map((entry) => [entry.id, entry.revision]));
    // The two claims swapped positions, so their own revisions move and the
    // root's direct child ID sequence changed with them.
    assert.equal(revisions[rootId], 3);
    assert.equal(revisions[claimOne], 2);
    assert.equal(revisions[claimTwo], 2);
    assert.equal(revisions[evidence], 1);
    await server.close();

    const reopened = await openStoryStore(dir);
    const persisted = await reopened.read();
    assert.equal(persisted.revision, 3);
    assert.equal(persisted.comments.length, 1);
    assert.equal(persisted.comments[0].body, '把单位改成毫秒并保留数据值');
    const byId = new Map(persisted.nodes.map((entry) => [entry.id, entry]));
    assert.equal(byId.get(rootId).title, '缓存策略对响应时间的影响');
    assert.equal(byId.get(rootId).blocks[0].text, '根正文，含行内公式 $E=mc^2$。');
    assert.equal(byId.get(claimTwo).blocks[0].latex, '\\frac{a}{b}');
    assert.equal(byId.get(claimTwo).position, 0);
    assert.equal(byId.get(evidence).blocks[0].rows[0][1], '120 ms\n原值');
    assert.equal(byId.get(evidence).blocks[1].text, '行内 $a_b$ 与反斜杠 \\\\ 保留。');
    assert.deepEqual(byId.get(evidence).sources, [{ label: '压测报告', url: 'https://example.com/report' }]);
  });

  test('tree invariants reject root edits, cycles, orphans, and evidence children', async () => {
    const { dir } = await makeProject();
    const server = await startServer(dir);
    const client = httpClient(server);
    const story = (await client.call('/api/story')).body;
    const rootId = story.rootId;
    const claim = '44444444-4444-4444-8444-444444444444';
    const evidence = '55555555-5555-4555-8555-555555555555';
    const base = [
      node({ id: rootId, kind: 'topic', title: '根' }),
      node({ id: claim, parentId: rootId, position: 0, title: '分论点', kind: 'claim' }),
      node({ id: evidence, parentId: claim, position: 0, title: '论据', kind: 'evidence' }),
    ];
    const ok = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision: 0, nodes: base } });
    assert.equal(ok.status, 200);
    const onDisk = await readFile(storylinePaths(dir).story, 'utf8');

    const reject = async (nodes, code, expectedRevision = 1) => {
      const response = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision, nodes } });
      assert.equal(response.status, 400, `${code} should be a validation failure, got ${response.status}`);
      assert.equal(response.body.error.code, code);
      assert.equal(await readFile(storylinePaths(dir).story, 'utf8'), onDisk);
      assert.equal((await client.call('/api/story')).body.revision, 1);
    };

    await reject(base.slice(1), 'INVALID_TREE');
    await reject(
      [...base, node({ id: '88888888-8888-4888-8888-888888888888', parentId: rootId, kind: 'topic', position: 1, title: '第二个主题' })],
      'INVALID_TREE',
    );
    await reject(base.filter((entry) => entry.id !== rootId), 'INVALID_TREE');
    await reject(base.map((entry) => (entry.id === claim ? { ...entry, position: 4 } : entry)), 'INVALID_POSITION');
    await reject(
      base.map((entry) => (entry.id === claim ? { ...entry, parentId: evidence } : entry)),
      'INVALID_TREE',
    );
    await reject(
      base.map((entry) => (entry.id === evidence ? { ...entry, parentId: rootId } : entry)),
      'INVALID_TREE',
    );
    await reject(
      [...base, node({ id: '66666666-6666-4666-8666-666666666666', parentId: evidence, position: 0, kind: 'claim' })],
      'INVALID_TREE',
    );
    await reject(
      [...base, node({ id: '77777777-7777-4777-8777-777777777777', parentId: null, position: 0, kind: 'claim' })],
      'INVALID_TREE',
    );
    await reject([...base, { ...base[1] }], 'DUPLICATE_ID');
    await reject(
      base.map((entry) => (entry.id === evidence ? { ...entry, kind: 'claim' } : entry)),
      'NODE_KIND_IMMUTABLE',
    );
    await reject(
      base.map((entry) => (entry.id === evidence ? { ...entry, blocks: [{ id: 'b', type: 'image', assetId: 'nope', role: 'figure', alt: '', caption: '' }] } : entry)),
      'UNKNOWN_ASSET',
    );
    await reject(
      base.map((entry) => (entry.id === evidence ? { ...entry, blocks: [{ id: 'b', type: 'table', columns: ['a', 'b'], rows: [['only-one']], caption: '' }] } : entry)),
      'INVALID_TABLE',
    );
    await reject(
      base.map((entry) => (entry.id === evidence ? { ...entry, sources: [{ label: 'x', url: 'javascript:alert(1)' }] } : entry)),
      'INVALID_SOURCE_URL',
    );
    await reject(
      base.map((entry) => (entry.id === evidence ? { ...entry, extra: true } : entry)),
      'UNKNOWN_FIELD',
    );

    // The root's own fields stay editable.
    const retitled = await client.call('/api/tree', {
      method: 'PUT',
      body: {
        expectedRevision: 1,
        nodes: base.map((entry) => (entry.id === rootId ? { ...entry, title: '新的根题目', sources: [{ label: '来源', url: '' }] } : entry)),
      },
    });
    assert.equal(retitled.status, 200);
    assert.equal(retitled.body.story.nodes.find((entry) => entry.id === rootId).title, '新的根题目');
  });

  test('two writers at the same revision: the first wins and the second gets the current revision', async () => {
    const { dir } = await makeProject();
    const server = await startServer(dir);
    const client = httpClient(server);
    const story = (await client.call('/api/story')).body;
    const tree = (title) => [node({ id: story.rootId, kind: 'topic', title, blocks: [], sources: [] })];
    const first = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision: 0, nodes: tree('第一个客户端的题目') } });
    assert.equal(first.status, 200);
    const second = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision: 0, nodes: tree('第二个客户端的题目') } });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'REVISION_CONFLICT');
    assert.equal(second.body.revision, 1);
    assert.equal((await client.call('/api/story')).body.nodes[0].title, '第一个客户端的题目');

    const missing = await client.call('/api/tree', { method: 'PUT', body: { nodes: tree('没有版本') } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, 'INVALID_EXPECTED_REVISION');
  });
});

describe('storyline workbench rounds and proposals', () => {
  async function roundFixture() {
    const { dir } = await makeProject();
    const server = await startServer(dir);
    const client = httpClient(server);
    const story = (await client.call('/api/story')).body;
    const rootId = story.rootId;
    const claim = '88888888-8888-4888-8888-888888888888';
    const evidence = '99999999-9999-4999-8999-999999999999';
    const tree = [
      node({ id: rootId, kind: 'topic', title: '根主题', blocks: [{ id: 'b1', type: 'markdown', text: '根正文' }] }),
      node({ id: claim, parentId: rootId, position: 0, title: '分论点', kind: 'claim' }),
      node({ id: evidence, parentId: claim, position: 0, title: '论据', kind: 'evidence' }),
    ];
    const put = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision: 0, nodes: tree } });
    assert.equal(put.status, 200);
    const comment = await client.call('/api/comments', {
      method: 'POST',
      body: { expectedRevision: put.body.story.revision, nodeId: evidence, body: '把响应时间单位改成毫秒并保留数据值' },
    });
    assert.equal(comment.status, 200);
    const resolved = await client.call('/api/comments', {
      method: 'POST',
      body: { expectedRevision: comment.body.story.revision, nodeId: claim, body: '已经处理过的一条' },
    });
    const closed = await client.call(`/api/comments/${resolved.body.comment.id}`, {
      method: 'PATCH',
      body: { expectedRevision: resolved.body.story.revision, status: 'resolved' },
    });
    assert.equal(closed.status, 200);
    const roundResponse = await client.call('/api/rounds', {
      method: 'POST',
      body: { expectedRevision: closed.body.story.revision },
    });
    assert.equal(roundResponse.status, 200);
    assert.equal(roundResponse.body.story.revision, closed.body.story.revision);
    return { dir, server, client, rootId, claim, evidence, round: roundResponse.body.round, story: roundResponse.body.story };
  }

  test('a round keeps only open comments and reads back exactly through the CLI', async () => {
    const fixture = await roundFixture();
    const { client, round, evidence, story } = fixture;
    assert.equal(round.baseRevision, story.revision);
    assert.equal(round.comments.length, 1);
    assert.equal(round.comments[0].nodeId, evidence);
    assert.equal(round.comments[0].body, '把响应时间单位改成毫秒并保留数据值');
    assert.equal(round.comments[0].nodeRevision, story.nodes.find((entry) => entry.id === evidence).revision);

    const readBack = await client.call(`/api/rounds/${round.id}`);
    assert.equal(readBack.status, 200);
    assert.deepEqual(readBack.body, round);

    const cli = await run(process.execPath, [cliPath, 'context', '--project', fixture.dir, '--round', round.id]);
    assert.deepEqual(JSON.parse(cli.stdout), round);
  });

  test('import changes nothing, accept applies the diff and resolves listed comments, reject changes nothing', async () => {
    const fixture = await roundFixture();
    const { client, round, rootId, claim, evidence, story } = fixture;
    const candidate = round.nodes.map((entry) => {
      if (entry.id === evidence) return { ...entry, title: '压测数据（毫秒）' };
      return entry;
    });
    const proposalFile = path.join(fixture.dir, 'proposal.json');
    await writeFile(
      proposalFile,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          roundId: round.id,
          baseRevision: round.baseRevision,
          nodes: candidate,
          addressedCommentIds: [round.comments[0].id],
          summary: '把论据题目改成毫秒口径',
        },
        null,
        2,
      )}\n`,
    );
    const before = (await client.call('/api/story')).body;
    const proposed = await run(process.execPath, [cliPath, 'propose', '--project', fixture.dir, '--file', proposalFile]);
    const summary = JSON.parse(proposed.stdout);
    assert.equal(summary.status, 'pending');
    assert.equal(summary.stale, false);
    const afterImport = (await client.call('/api/story')).body;
    assert.equal(afterImport.revision, before.revision);
    assert.equal(afterImport.nodes.find((entry) => entry.id === evidence).title, before.nodes.find((entry) => entry.id === evidence).title);
    assert.equal(afterImport.proposals.length, 1);

    const accept = await client.call(`/api/proposals/${summary.proposalId}/decision`, {
      method: 'POST',
      body: { expectedRevision: afterImport.revision, decision: 'accept' },
    });
    assert.equal(accept.status, 200);
    assert.equal(accept.body.story.revision, afterImport.revision + 2);
    assert.equal(accept.body.story.nodes.find((entry) => entry.id === evidence).title, '压测数据（毫秒）');
    assert.equal(accept.body.story.nodes.find((entry) => entry.id === rootId).title, before.nodes.find((entry) => entry.id === rootId).title);
    assert.equal(accept.body.story.nodes.find((entry) => entry.id === claim).title, '分论点');
    assert.equal(accept.body.proposal.status, 'accepted');
    assert.deepEqual(
      accept.body.story.comments.map((comment) => comment.status),
      ['resolved', 'resolved'],
    );

    // A second round, then a rejected proposal leaves the applied text alone.
    const nextRound = await client.call('/api/rounds', { method: 'POST', body: { expectedRevision: accept.body.story.revision } });
    assert.equal(nextRound.body.round.comments.length, 0);
    const rejectFile = path.join(fixture.dir, 'proposal-reject.json');
    await writeFile(
      rejectFile,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          roundId: nextRound.body.round.id,
          baseRevision: nextRound.body.round.baseRevision,
          nodes: nextRound.body.round.nodes.map((entry) => (entry.id === claim ? { ...entry, title: '拒绝的题目' } : entry)),
          addressedCommentIds: [],
          summary: '这条提案会被拒绝',
        },
        null,
        2,
      )}\n`,
    );
    const imported = JSON.parse((await run(process.execPath, [cliPath, 'propose', '--project', fixture.dir, '--file', rejectFile])).stdout);
    const rejected = await client.call(`/api/proposals/${imported.proposalId}/decision`, {
      method: 'POST',
      body: { expectedRevision: nextRound.body.story.revision, decision: 'reject' },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.proposal.status, 'rejected');
    assert.equal(rejected.body.story.revision, nextRound.body.story.revision);
    assert.equal(rejected.body.story.nodes.find((entry) => entry.id === claim).title, '分论点');
  });

  test('a proposal is refused after the story moved on, at import and at accept', async () => {
    const fixture = await roundFixture();
    const { client, round, evidence, story } = fixture;
    const candidate = round.nodes.map((entry) => (entry.id === evidence ? { ...entry, title: '提案里的题目' } : entry));
    const body = {
      schemaVersion: 1,
      roundId: round.id,
      baseRevision: round.baseRevision,
      nodes: candidate,
      addressedCommentIds: [],
      summary: '基线过期的提案',
    };
    // The user edits after the round was frozen.
    const edited = await client.call('/api/tree', {
      method: 'PUT',
      body: {
        expectedRevision: story.revision,
        nodes: story.nodes.map((entry) => (entry.id === evidence ? { ...entry, title: '用户改过的题目' } : entry)),
      },
    });
    assert.equal(edited.status, 200);
    const staleImport = await client.call('/api/proposals', { method: 'POST', body });
    assert.equal(staleImport.status, 409);
    assert.equal(staleImport.body.error.code, 'PROPOSAL_STALE');
    assert.equal(staleImport.body.revision, edited.body.story.revision);
    assert.equal((await client.call('/api/story')).body.nodes.find((entry) => entry.id === evidence).title, '用户改过的题目');

    // A proposal imported earlier is refused at accept once the story moves.
    const fresh = await client.call('/api/rounds', { method: 'POST', body: { expectedRevision: edited.body.story.revision } });
    const imported = await client.call('/api/proposals', {
      method: 'POST',
      body: { ...body, roundId: fresh.body.round.id, baseRevision: fresh.body.round.baseRevision },
    });
    assert.equal(imported.status, 200);
    const later = await client.call('/api/comments', {
      method: 'POST',
      body: { expectedRevision: fresh.body.story.revision, nodeId: evidence, body: '又加了一条注释' },
    });
    assert.equal(later.status, 200);
    const accept = await client.call(`/api/proposals/${imported.body.proposal.id}/decision`, {
      method: 'POST',
      body: { expectedRevision: later.body.story.revision, decision: 'accept' },
    });
    assert.equal(accept.status, 409);
    assert.equal(accept.body.error.code, 'PROPOSAL_STALE');
    assert.equal((await client.call('/api/story')).body.nodes.find((entry) => entry.id === evidence).title, '用户改过的题目');
  });

  test('a round addresses only the comments that belong to it and rejects a foreign comment id', async () => {
    const fixture = await roundFixture();
    const { client, round } = fixture;
    const foreign = await client.call('/api/proposals', {
      method: 'POST',
      body: {
        schemaVersion: 1,
        roundId: round.id,
        baseRevision: round.baseRevision,
        nodes: round.nodes,
        addressedCommentIds: ['not-a-comment-in-this-round'],
        summary: '引用了不属于本轮的注释',
      },
    });
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.error.code, 'UNKNOWN_COMMENT');
    const missingRound = await client.call('/api/proposals', {
      method: 'POST',
      body: { schemaVersion: 1, roundId: 'round-missing', baseRevision: round.baseRevision, nodes: round.nodes, addressedCommentIds: [], summary: '' },
    });
    assert.equal(missingRound.status, 400);
    assert.equal(missingRound.body.error.code, 'UNKNOWN_ROUND');
  });
});

describe('storyline workbench export', () => {
  test('export keeps data, math source, asset paths, and every node id, and never rewrites', async () => {
    const { dir } = await makeProject({ kind: 'slides', title: '试点汇报' });
    for (const name of ['paper.md', 'deck.tex', 'deck.pptx']) {
      await writeFile(path.join(dir, name), `sentinel ${name}\n`);
    }
    const sentinels = Object.fromEntries(
      await Promise.all(['paper.md', 'deck.tex', 'deck.pptx'].map(async (name) => [name, await hashFile(path.join(dir, name))])),
    );
    const server = await startServer(dir);
    const client = httpClient(server);
    const story = (await client.call('/api/story')).body;
    const upload = await client.call('/api/assets?filename=chart.png', {
      method: 'POST',
      raw: PNG_BYTES,
      headers: { 'Content-Type': 'image/png' },
    });
    assert.equal(upload.status, 200);
    assert.equal(upload.body.story.revision, story.revision);
    const assetId = upload.body.asset.id;

    // A deep chain exercises the fixed level-six heading rule.
    const chain = [];
    const depths = 8;
    let parentId = story.rootId;
    const ids = [];
    for (let depth = 1; depth <= depths; depth += 1) {
      const id = `depth-${depth}`.padEnd(36, '0');
      ids.push(id);
      const kind = depth === depths ? 'evidence' : 'claim';
      chain.push(node({ id, parentId, position: depth === 1 ? 1 : 0, kind, title: `层 ${depth}`, blocks: [] }));
      parentId = id;
    }
    const tree = [
      node({
        id: story.rootId,
        kind: 'topic',
        title: '试点汇报',
        blocks: [{ id: 'md', type: 'markdown', text: '行内 $E=mc^2$ 与块公式：\n\n$$\n\\frac{a}{b}\n$$' }],
      }),
      node({ id: 'c1'.padEnd(36, '0'), parentId: story.rootId, position: 0, kind: 'claim', title: '命中率提升' }),
      node({
        id: 'e1'.padEnd(36, '0'),
        parentId: 'c1'.padEnd(36, '0'),
        position: 0,
        kind: 'evidence',
        title: '压测数据',
        blocks: [
          { id: 'table-1', type: 'table', columns: ['指标', '数值|备注'], rows: [['P99', '120 ms\n原值']], caption: '夹具数据' },
          { id: 'image-1', type: 'image', assetId, role: 'figure', alt: '柱状对比', caption: '柱状图' },
          { id: 'math-1', type: 'math', latex: '\\frac{P99_{new}}{P99_{old}}', display: true },
        ],
        sources: [{ label: '内部压测', url: 'https://example.com/report' }],
      }),
      ...chain,
    ];
    const put = await client.call('/api/tree', { method: 'PUT', body: { expectedRevision: story.revision, nodes: tree } });
    assert.equal(put.status, 200);
    const comment = await client.call('/api/comments', {
      method: 'POST',
      body: { expectedRevision: put.body.story.revision, nodeId: 'e1'.padEnd(36, '0'), body: '这条注释只进反馈文件' },
    });
    assert.equal(comment.status, 200);

    const exported = await client.call('/api/exports', {
      method: 'POST',
      body: { expectedRevision: comment.body.story.revision },
    });
    assert.equal(exported.status, 200);
    const revision = exported.body.export.revision;
    assert.equal(revision, comment.body.story.revision);
    assert.deepEqual(exported.body.export.files, ['feedback.json', 'story.json', 'storyline.md']);
    const exportDir = path.join(dir, '.storyline', 'exports', `r${revision}`);
    const markdown = await readFile(path.join(exportDir, 'storyline.md'), 'utf8');
    const exportedStory = JSON.parse(await readFile(path.join(exportDir, 'story.json'), 'utf8'));
    const feedback = JSON.parse(await readFile(path.join(exportDir, 'feedback.json'), 'utf8'));

    assert.deepEqual(Object.keys(exportedStory), ['schemaVersion', 'projectId', 'kind', 'revision', 'rootId', 'nodes', 'assets']);
    assert.equal(exportedStory.kind, 'slides');
    for (const entry of exportedStory.nodes) {
      assert.ok(markdown.includes(`id=${entry.id}`), `export must name node ${entry.id}`);
    }
    assert.ok(markdown.includes('| P99 | 120 ms<br>原值 |'));
    assert.ok(markdown.includes('\\frac{P99_{new}}{P99_{old}}'));
    assert.ok(markdown.includes(`../../assets/${upload.body.asset.storedName}`));
    assert.ok(!markdown.includes('这条注释只进反馈文件'), 'comments never enter the story markdown');
    assert.equal(feedback.comments.length, 1);
    assert.equal(feedback.comments[0].body, '这条注释只进反馈文件');
    assert.equal(feedback.comments[0].nodeMissing, false);
    // Depth 8 is capped at level six and keeps the parent id.
    const deepLine = markdown.split('\n').find((line) => line.includes(`id=${ids[depths - 1]}`));
    assert.ok(deepLine.includes('depth='), 'deep nodes record their depth');
    assert.ok(markdown.includes('###### '), 'deep nodes use a level-six heading');
    assert.ok(!markdown.includes('####### '), 'no heading deeper than six');

    // Repeating the export of the same revision returns the same files without rewriting.
    const exportHash = await hashFile(path.join(exportDir, 'storyline.md'));
    const again = await client.call('/api/exports', { method: 'POST', body: { expectedRevision: revision } });
    assert.equal(again.status, 200);
    assert.equal(again.body.export.reused, true);
    assert.equal(await hashFile(path.join(exportDir, 'storyline.md')), exportHash);

    for (const [name, hash] of Object.entries(sentinels)) {
      assert.equal(await hashFile(path.join(dir, name)), hash, `${name} must stay untouched`);
    }
  });

  test('renderStoryMarkdown escapes table cells and keeps raw latex', () => {
    const story = createStory({ projectId: 'p', kind: 'article', title: 't' });
    const withBlocks = {
      ...story,
      revision: 1,
      nodes: [
        {
          ...story.nodes[0],
          blocks: [
            { id: 'table', type: 'table', columns: ['a|b', 'c'], rows: [['x|y', 'line1\nline2']], caption: 'cap' },
            { id: 'math', type: 'math', latex: 'a_b \\\\ c', display: false },
          ],
          revision: 2,
        },
      ],
    };
    const markdown = renderStoryMarkdown(withBlocks);
    assert.ok(markdown.includes('| a\\|b | c |'));
    assert.ok(markdown.includes('| x\\|y | line1<br>line2 |'));
    assert.ok(markdown.includes('$a_b \\\\ c$'));
    const files = buildExportFiles(withBlocks, { generatedAt: '2024-01-01T00:00:00.000Z' });
    assert.deepEqual(Object.keys(files), ['story.json', 'storyline.md', 'feedback.json']);
  });
});

describe('storyline workbench http surface', () => {
  async function securedFixture() {
    const { dir } = await makeProject();
    const server = await startServer(dir);
    return { dir, server, client: httpClient(server) };
  }

  test('invalid JSON, unknown fields, and wrong auth are refused', async () => {
    const { client, server } = await securedFixture();
    const broken = await client.call('/api/tree', {
      method: 'PUT',
      raw: '{ not json',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(broken.status, 400);
    assert.equal(broken.body.error.code, 'INVALID_JSON');

    const unknownField = await client.call('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: 0, nodes: [], extra: true },
    });
    assert.equal(unknownField.status, 400);
    assert.equal(unknownField.body.error.code, 'UNKNOWN_FIELD');

    const wrongToken = await client.call('/api/story', { headers: { Authorization: 'Bearer wrong' } });
    assert.equal(wrongToken.status, 403);
    assert.equal(wrongToken.body.error.code, 'UNAUTHORIZED');

    const noToken = await fetch(`http://127.0.0.1:${server.port}/api/story`);
    assert.equal(noToken.status, 403);
    assert.equal(noToken.headers.get('access-control-allow-origin'), null);

    const badOrigin = await client.call('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: 0, nodes: [] },
      headers: { Origin: 'http://evil.example' },
    });
    assert.equal(badOrigin.status, 403);
    assert.equal(badOrigin.body.error.code, 'ORIGIN_NOT_ALLOWED');

    const goodOrigin = await client.call('/api/story', {
      method: 'GET',
      headers: { Origin: `http://127.0.0.1:${server.port}` },
    });
    assert.equal(goodOrigin.status, 200);
  });

  test('a foreign Host header is refused', async () => {
    const { server } = await securedFixture();
    const status = await new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port: server.port,
          path: '/api/story',
          method: 'GET',
          headers: { Host: 'evil.example', Authorization: `Bearer ${server.token}` },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on('error', reject);
      request.end();
    });
    assert.equal(status, 403);
  });

  test('oversized bodies and non-image uploads are refused without a partial file', async () => {
    const { client, dir } = await securedFixture();
    const padding = 'x'.repeat(10 * 1024 * 1024 + 1024);
    const tooBig = await client.call('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: 0, nodes: [], padding },
    });
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.error.code, 'PAYLOAD_TOO_LARGE');

    const notAnImage = await client.call('/api/assets?filename=notes.txt', {
      method: 'POST',
      raw: Buffer.from('plain text, not an image'),
      headers: { 'Content-Type': 'text/plain' },
    });
    assert.equal(notAnImage.status, 400);
    assert.equal(notAnImage.body.error.code, 'INVALID_ASSET_TYPE');

    const lyingType = await client.call('/api/assets?filename=chart.jpg', {
      method: 'POST',
      raw: PNG_BYTES,
      headers: { 'Content-Type': 'image/jpeg' },
    });
    assert.equal(lyingType.status, 400);
    assert.equal(lyingType.body.error.code, 'ASSET_TYPE_MISMATCH');

    const assets = await readdir(storylinePaths(dir).assets);
    assert.deepEqual(assets, [], 'a rejected upload leaves no file behind');

    const svg = await client.call('/api/assets?filename=icon.svg', {
      method: 'POST',
      raw: SVG_BYTES,
      headers: { 'Content-Type': 'image/svg+xml' },
    });
    assert.equal(svg.status, 200);
    assert.deepEqual(await readdir(storylinePaths(dir).assets), [svg.body.asset.storedName]);
    const served = await client.call(`/api/assets/${svg.body.asset.id}`);
    assert.equal(served.status, 200);
  });

  test('static assets follow an allowlist and reject traversal', async () => {
    const { server } = await securedFixture();
    const base = `http://127.0.0.1:${server.port}`;
    const index = await fetch(`${base}/`);
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type') ?? '', /text\/html/);
    const font = await fetch(`${base}/vendor/katex/fonts/KaTeX_Main-Regular.woff2`);
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    for (const route of [
      '/app.js/../../etc/passwd',
      '/vendor/katex/fonts/..%2f..%2f..%2f..%2fetc%2fpasswd',
      '/copy.zh.js%00.png',
      '/api/assets/..%2fstory.json',
      '/story.json',
    ]) {
      const response = await fetch(`${base}${route}`);
      assert.ok([403, 404].includes(response.status), `${route} should not be served, got ${response.status}`);
    }
  });

  test('an asset file that escapes the assets directory is refused', async () => {
    const { dir } = await makeProject();
    const target = path.join(storylinePaths(dir).assets, 'escaped.png');
    await symlink('/etc/hostname', target);
    const store = await openStoryStore(dir);
    const story = await store.read();
    const withAsset = {
      ...story,
      assets: [{ id: 'escaped', filename: 'escaped.png', mime: 'image/png', size: 12, storedName: 'escaped.png' }],
    };
    const validated = validateStory(withAsset);
    assert.equal(validated.ok, true);
    await writeFile(storylinePaths(dir).story, `${JSON.stringify(validated.story, null, 2)}\n`);
    const server = await startServer(dir);
    const client = httpClient(server);
    const response = await client.call('/api/assets/escaped');
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'ASSET_PATH_UNSAFE');
  });

  test('a missing asset file reports a missing asset, not a directory read', async () => {
    const { dir } = await makeProject();
    const server = await startServer(dir);
    const client = httpClient(server);
    const upload = await client.call('/api/assets?filename=chart.png', {
      method: 'POST',
      raw: PNG_BYTES,
      headers: { 'Content-Type': 'image/png' },
    });
    assert.equal(upload.status, 200);
    await rm(path.join(storylinePaths(dir).assets, upload.body.asset.storedName));
    const missing = await client.call(`/api/assets/${upload.body.asset.id}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'ASSET_MISSING');
  });

  test('a failed commit returns an error and keeps the last committed story', async () => {
    const { dir } = await makeProject();
    const server = await startServer(dir);
    const client = httpClient(server);
    const story = (await client.call('/api/story')).body;
    const committed = await client.call('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: 0, nodes: [node({ id: story.rootId, kind: 'topic', title: '稳定题目' })] },
    });
    assert.equal(committed.status, 200);
    const saved = await readFile(storylinePaths(dir).story, 'utf8');
    // Replacing the store file with a directory makes the rename step fail.
    await rm(storylinePaths(dir).story);
    await mkdir(storylinePaths(dir).story);
    const failed = await client.call('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: 1, nodes: [node({ id: story.rootId, kind: 'topic', title: '写不进去的题目' })] },
    });
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error.code, 'INTERNAL');
    const after = await client.call('/api/story');
    assert.equal(after.status, 200);
    assert.equal(after.body.revision, 1);
    assert.equal(after.body.nodes[0].title, '稳定题目');
    await rm(storylinePaths(dir).story, { recursive: true, force: true });
    await writeFile(storylinePaths(dir).story, saved);
    assert.equal((await client.call('/api/story')).body.nodes[0].title, '稳定题目');
  });
});

describe('storyline workbench cli', () => {
  test('serve prints a loopback url and a second server refuses the same project', async () => {
    const { dir } = await makeProject();
    const child = spawn(process.execPath, [cliPath, 'serve', '--project', dir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    cleanups.push(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('close', resolve));
    });
    const url = await new Promise((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new Error('serve did not print a url in time')), 20000);
      child.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const match = /url: (http:\/\/127\.0\.0\.1:(\d+)\/#token=[0-9a-f]+)/u.exec(buffer);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/#token=[0-9a-f]{64}$/u);
    assert.ok(!url.includes('0.0.0.0'), 'the server binds loopback only');

    const second = await run(process.execPath, [cliPath, 'serve', '--project', dir, '--port', '0']).then(
      () => ({ code: 0, stderr: '' }),
      (error) => ({ code: error.code ?? 1, stderr: String(error.stderr ?? '') }),
    );
    assert.notEqual(second.code, 0);
    assert.match(second.stderr, /SERVER_ALREADY_RUNNING/u);

    const runtime = JSON.parse(await readFile(storylinePaths(dir).runtime, 'utf8'));
    assert.equal((await stat(storylinePaths(dir).runtime)).mode & 0o777, 0o600);
    assert.equal(runtime.projectDir, dir);

    const origin = new URL(url);
    const listed = await fetch(`${origin.origin}/api/story`, {
      headers: { Authorization: `Bearer ${runtime.token}` },
    });
    assert.equal(listed.status, 200);
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('close', resolve));
    const afterClose = await readFile(storylinePaths(dir).runtime, 'utf8').catch(() => null);
    assert.equal(afterClose, null, 'the runtime record is removed on shutdown');
  });

  test('context and propose need a live server and report the start command', async () => {
    const { dir } = await makeProject();
    const proposalFile = path.join(dir, 'proposal.json');
    await writeFile(proposalFile, `${JSON.stringify({ schemaVersion: 1, roundId: 'round-1', baseRevision: 0, nodes: [], addressedCommentIds: [], summary: '' })}\n`);
    const failures = [];
    for (const args of [
      ['context', '--project', dir, '--round', 'round-1'],
      ['propose', '--project', dir, '--file', proposalFile],
    ]) {
      const result = await run(process.execPath, [cliPath, ...args]).then(
        () => ({ code: 0, stderr: '' }),
        (error) => ({ code: error.code ?? 1, stderr: String(error.stderr ?? '') }),
      );
      failures.push(result);
    }
    for (const result of failures) {
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /SERVER_NOT_RUNNING/u);
      assert.match(result.stderr, /storyline-workbench\.mjs serve --project/u);
    }
  });

  test('init reports the created paths and kind', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'storyline-cli-'));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    const result = await run(process.execPath, [cliPath, 'init', '--project', dir, '--kind', 'slides', '--title', '试点汇报']);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.created, true);
    assert.equal(payload.kind, 'slides');
    assert.equal(payload.projectDir, dir);
    assert.equal(payload.title, '试点汇报');
    assert.ok(payload.storyPath.endsWith(path.join('.storyline', 'story.json')));

    const noTitle = await run(process.execPath, [cliPath, 'init', '--project', dir, '--kind', 'slides']);
    assert.equal(JSON.parse(noTitle.stdout).created, false);
  });
});

describe('storyline workbench model validation', () => {
  test('validateStory rejects unknown top-level fields and broken block shapes', () => {
    const story = createStory({ projectId: 'p', kind: 'article', title: 't' });
    assert.equal(validateStory(story).ok, true);
    const withExtra = { ...story, extra: 1 };
    const result = validateStory(withExtra);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, 'UNKNOWN_FIELD');

    const duplicateBlock = {
      ...story,
      nodes: [
        {
          ...story.nodes[0],
          blocks: [
            { id: 'same', type: 'markdown', text: 'a' },
            { id: 'same', type: 'markdown', text: 'b' },
          ],
        },
      ],
    };
    const duplicateResult = validateStory(duplicateBlock);
    assert.equal(duplicateResult.ok, false);
    assert.ok(duplicateResult.errors.some((error) => error.code === 'DUPLICATE_ID'));

    const badRole = {
      ...story,
      assets: [{ id: 'asset', filename: 'a.png', mime: 'image/png', size: 1, storedName: 'asset.png' }],
      nodes: [
        {
          ...story.nodes[0],
          blocks: [{ id: 'img', type: 'image', assetId: 'asset', role: 'banner', alt: '', caption: '' }],
        },
      ],
    };
    assert.ok(validateStory(badRole).errors.some((error) => error.code === 'INVALID_ROLE'));
  });

  test('applyTreeUpdate bumps only changed nodes and keeps the rest', () => {
    const story = createStory({ projectId: 'p', kind: 'article', title: 'root' });
    const rootId = story.rootId;
    const child = node({ id: 'child-node', parentId: rootId, position: 0, kind: 'claim', title: 'a' });
    const first = applyTreeUpdate({ story, nodes: [node({ id: rootId, kind: 'topic', title: 'root' }), child] });
    assert.equal(first.ok, true);
    assert.equal(first.story.revision, 1);
    assert.equal(first.story.nodes.find((entry) => entry.id === rootId).revision, 2);

    const sameAgain = applyTreeUpdate({ story: first.story, nodes: [node({ id: rootId, kind: 'topic', title: 'root' }), child] });
    assert.equal(sameAgain.ok, true);
    assert.equal(sameAgain.story.revision, 1, 'an identical save does not bump the revision');
    assert.equal(sameAgain.story.nodes.find((entry) => entry.id === child.id).revision, 1);

    const retitled = applyTreeUpdate({
      story: first.story,
      nodes: [node({ id: rootId, kind: 'topic', title: 'root' }), { ...child, title: 'b' }],
    });
    assert.equal(retitled.ok, true);
    assert.equal(retitled.story.revision, 2);
    assert.equal(retitled.story.nodes.find((entry) => entry.id === child.id).revision, 2);
    assert.equal(retitled.story.nodes.find((entry) => entry.id === rootId).revision, 2);

    const added = applyTreeUpdate({
      story: retitled.story,
      nodes: [
        node({ id: rootId, kind: 'topic', title: 'root' }),
        { ...child, title: 'b' },
        node({ id: 'child-two', parentId: rootId, position: 1, kind: 'claim', title: 'c' }),
      ],
    });
    assert.equal(added.ok, true);
    assert.equal(
      added.story.nodes.find((entry) => entry.id === rootId).revision,
      3,
      'a changed child id sequence bumps the parent',
    );
    assert.equal(added.story.nodes.find((entry) => entry.id === child.id).revision, 2);
    assert.equal(added.story.nodes.find((entry) => entry.id === 'child-two').revision, 1);
  });

  test('node kind is immutable and StorylineError carries its code', () => {
    const story = createStory({ projectId: 'p', kind: 'article', title: 'root' });
    const rootId = story.rootId;
    const placed = applyTreeUpdate({
      story,
      nodes: [
        node({ id: rootId, kind: 'topic', title: 'root' }),
        node({ id: 'claim-a', parentId: rootId, position: 0, kind: 'claim', title: 'x' }),
        node({ id: 'claim-b', parentId: 'claim-a', position: 0, kind: 'claim', title: 'y' }),
      ],
    });
    assert.equal(placed.ok, true);
    // A structurally legal relabel (evidence under a claim) is still refused.
    const changed = applyTreeUpdate({
      story: placed.story,
      nodes: [
        node({ id: rootId, kind: 'topic', title: 'root' }),
        node({ id: 'claim-a', parentId: rootId, position: 0, kind: 'claim', title: 'x' }),
        node({ id: 'claim-b', parentId: 'claim-a', position: 0, kind: 'evidence', title: 'y' }),
      ],
    });
    assert.equal(changed.ok, false);
    assert.equal(changed.errors[0].code, 'NODE_KIND_IMMUTABLE');
    const error = new StorylineError('SOME_CODE', 'message', { status: 418 });
    assert.equal(error.code, 'SOME_CODE');
    assert.equal(error.details.status, 418);
  });

  test('a comment written before a node edit is reported as written against an earlier revision', () => {
    const story = createStory({ projectId: 'p', kind: 'article', title: 'root' });
    const rootId = story.rootId;
    const base = applyTreeUpdate({ story, nodes: [node({ id: rootId, kind: 'topic', title: 'root', blocks: [{ id: 'b', type: 'markdown', text: 'a' }] })] });
    const comment = { id: 'c1', nodeId: rootId, nodeRevision: base.story.nodes[0].revision, body: 'x', status: 'open', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };
    const withComment = { ...base.story, comments: [comment] };
    assert.equal(validateStory(withComment).ok, true);
    const edited = applyTreeUpdate({ story: withComment, nodes: [node({ id: rootId, kind: 'topic', title: 'root', blocks: [{ id: 'b', type: 'markdown', text: 'changed' }] })] });
    const files = buildExportFiles(edited.story, { generatedAt: '2024-01-01T00:00:00.000Z' });
    const feedback = JSON.parse(files['feedback.json']);
    assert.equal(feedback.comments[0].writtenAgainstCurrentRevision, false);
    assert.equal(feedback.comments[0].status, 'open');
  });
});

describe('storyline workbench browser assets', () => {
  test('every copy key the client reads exists, and no key is dead', async () => {
    const assets = path.join(pluginRoot, 'assets', 'storyline-workbench');
    const [app, copy] = await Promise.all([
      readFile(path.join(assets, 'app.js'), 'utf8'),
      readFile(path.join(assets, 'copy.zh.js'), 'utf8'),
    ]);
    const defined = new Set([...copy.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gmu)].map((match) => match[1]));
    const used = new Set([...app.matchAll(/(?<![A-Za-z0-9_.])t\('([A-Za-z][A-Za-z0-9]*)'/gu)].map((match) => match[1]));
    // Labels passed to the error helper are read through the same lookup table.
    for (const match of app.matchAll(/handleWriteError\(error, '([A-Za-z][A-Za-z0-9]*)'/gu)) used.add(match[1]);
    assert.ok(defined.size > 100, 'the Chinese copy file carries the interface strings');
    const missing = [...used].filter((key) => !defined.has(key));
    assert.deepEqual(missing, [], 'a missing key would render its identifier in the interface');
    const unused = [...defined].filter((key) => !used.has(key));
    assert.deepEqual(unused, [], 'every defined string is reachable from the client');
  });

  test('the client loads math and markdown from bundled assets, never a public cdn', async () => {
    const assets = path.join(pluginRoot, 'assets', 'storyline-workbench');
    const [html, app, manifest] = await Promise.all([
      readFile(path.join(assets, 'index.html'), 'utf8'),
      readFile(path.join(assets, 'app.js'), 'utf8'),
      readFile(path.join(assets, 'vendor', 'manifest.json'), 'utf8'),
    ]);
    assert.match(html, /\/vendor\/katex\/katex\.min\.css/);
    assert.match(app, /import '\/vendor\/markdown-it\/markdown-it\.min\.js'/);
    assert.match(app, /import '\/vendor\/katex\/katex\.min\.js'/);
    assert.doesNotMatch(`${html}\n${app}`, /https?:\/\/(?:cdn|unpkg|jsdelivr)/iu);
    const parsed = JSON.parse(manifest);
    assert.deepEqual(parsed.packages.map((entry) => `${entry.name}@${entry.version}`), ['markdown-it@14.1.0', 'katex@0.16.22']);
    assert.equal(parsed.packages[1].fonts.count, 60);
  });
});
