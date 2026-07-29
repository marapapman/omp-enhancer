import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = join(__dirname, '..', 'mcp-server.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMcpClient(projectRoot) {
  let child;
  const responses = new Map();
  let nextId = 1;

  function ensureChild() {
    if (child && !child.killed) return;
    child = spawn(process.execPath, [MCP_SERVER], {
      env: { ...process.env, OMP_PROJECT_ROOT: projectRoot },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    responses.clear();
    child.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id != null) responses.set(msg.id, msg);
        } catch { /* ignore */ }
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => {});
  }

  function request(method, params) {
    const id = nextId++;
    ensureChild();
    return new Promise((resolve, reject) => {
      const msg = { jsonrpc: '2.0', id, method };
      if (params !== undefined) msg.params = params;
      child.stdin.write(JSON.stringify(msg) + '\n');
      const poll = () => {
        if (responses.has(id)) resolve(responses.get(id));
        else setTimeout(poll, 10);
      };
      setTimeout(poll, 10);
      setTimeout(() => reject(new Error(`Timeout waiting for id=${id}`)), 10000);
    });
  }

  function destroy() {
    if (child && !child.killed) child.kill();
  }

  return { request, destroy };
}

function assertToolSuccess(resp) {
  assert.ok(resp.result, 'Expected result in response');
  if (resp.result.isError) {
    const text = resp.result.content?.[0]?.text ?? JSON.stringify(resp.result);
    assert.fail(`Tool returned isError: ${text}`);
  }
  return resp.result;
}

function parseResultJson(result) {
  const text = result.content?.[0]?.text;
  assert.ok(text, 'Expected text content in result');
  return JSON.parse(text);
}

function getErrorText(resp) {
  return resp.result?.content?.[0]?.text ?? '';
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_GRAPH = JSON.stringify({
  id: 'root',
  layoutOptions: { 'elk.algorithm': 'layered' },
  children: [
    { id: 'a', width: 80, height: 40, label: 'Start' },
    { id: 'b', width: 80, height: 40, label: 'End' },
  ],
  edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
});

const THREE_NODE_GRAPH = JSON.stringify({
  id: 'pipeline',
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' },
  children: [
    { id: 'input', width: 100, height: 40, label: 'Input' },
    { id: 'process', width: 120, height: 40, label: 'Process' },
    { id: 'output', width: 100, height: 40, label: 'Output' },
  ],
  edges: [
    { id: 'e1', sources: ['input'], targets: ['process'] },
    { id: 'e2', sources: ['process'], targets: ['output'] },
  ],
});

// ===========================================================================
// Category 1: Full pipeline E2E
// ===========================================================================

describe('E2E: Full pipeline (catalog → generate → render)', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-tikz-e2e-pipeline-'));
    client = createMcpClient(tempDir);
  });

  after(() => { client.destroy(); rmSync(tempDir, { recursive: true, force: true }); });

  it('catalog_search returns structured results', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_catalog_search',
      arguments: { query: 'arrow', type: 'icon', limit: 5 },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    // searchCatalog returns 'items', not 'results' — agents must use data.items
    assert.ok(Array.isArray(data.items), 'data.items should be array');
    assert.ok(typeof data.total === 'number', 'data.total should be a number');
  });

  it('catalog_search with includeSource returns source data', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_catalog_search',
      arguments: { query: 'flowchart', type: 'template', limit: 3, includeSource: true },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    if (data.items && data.items.length > 0) {
      assert.ok(data.items[0].sourceContent !== undefined || data.items[0].sourcePath !== undefined,
        'Should have sourceContent or sourcePath when includeSource=true');
    }
  });

  it('generate_diagram with minimal graph produces valid TikZ', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: MINIMAL_GRAPH },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    assert.ok(typeof data.tikz === 'string', 'tikz should be a string');
    assert.ok(data.tikz.includes('\\begin{tikzpicture}'), 'Should contain tikzpicture env');
    assert.ok(data.ir, 'Should return positioned IR');
    assert.ok(data.metadata, 'Should return metadata');
    assert.equal(data.metadata.algorithm, 'layered');
    assert.equal(data.metadata.nodeCount, 2);
    assert.equal(data.metadata.edgeCount, 1);
  });

  it('generate_diagram with three-node pipeline succeeds (label now accepted on root)', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: THREE_NODE_GRAPH },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    assert.equal(data.metadata.nodeCount, 3);
    assert.equal(data.metadata.edgeCount, 2);
    // After fix: nodeLabel() accepts both node.properties.label AND node.label.
    // The graph has {id: 'input', label: 'Input'} — 'Input' should now render.
    assert.ok(data.tikz.includes('Input'),
      'node.label is now accepted as fallback — Input should render');
  });

  it('generate_diagram with preset produces sizing metadata', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: THREE_NODE_GRAPH, preset: 'paper-column' },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    assert.ok(data.metadata.sizing, 'Should have sizing metadata');
    assert.equal(data.metadata.sizing.preset, 'paper-column');
  });

  it('generate_diagram IR round-trip preserves structure', async () => {
    const resp1 = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: THREE_NODE_GRAPH },
    });
    const data1 = parseResultJson(assertToolSuccess(resp1));
    // MCP response IR is parsed object; re-stringify for round-trip
    const irString = typeof data1.ir === 'string' ? data1.ir : JSON.stringify(data1.ir);
    const resp2 = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: irString },
    });
    const data2 = parseResultJson(assertToolSuccess(resp2));
    assert.equal(data2.ok, true);
    assert.equal(data2.metadata.nodeCount, data1.metadata.nodeCount);
    assert.equal(data2.metadata.edgeCount, data1.metadata.edgeCount);
  });

  it('render_tikz on non-existent file returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_render',
      arguments: { sourcePath: 'nonexistent.tex' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('render_tikz on invalid TikZ source returns error', async () => {
    const badTex = join(tempDir, 'bad.tex');
    writeFileSync(badTex, '\\documentclass{article}\\begin{document}\\write18{rm -rf /}\\end{document}');
    const resp = await client.request('tools/call', {
      name: 'tikz_render',
      arguments: { sourcePath: 'bad.tex' },
    });
    assert.equal(resp.result.isError, true);
  });
});

// ===========================================================================
// Category 2: Common agent parameter mistakes
// ===========================================================================

describe('E2E: Agent parameter mistakes', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-tikz-e2e-params-'));
    client = createMcpClient(tempDir);
  });

  after(() => { client.destroy(); rmSync(tempDir, { recursive: true, force: true }); });

  it('graph as object returns clear error (not raw SyntaxError)', async () => {
    // After fix: MCP handler validates graph type before JSON.parse
    // and returns a clear message instead of raw SyntaxError
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: { id: 'root', children: [{ id: 'a', width: 80, height: 40 }] } },
    });
    assert.equal(resp.result.isError, true, 'Should error when graph is object not string');
    const text = getErrorText(resp);
    assert.ok(text.includes('JSON string'), 'Error should mention JSON string requirement');
  });

  it('graph as invalid JSON string returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: '{not valid json}' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('graph with x/y on input nodes still works (ELK overrides)', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40, x: 100, y: 200 },
        { id: 'b', width: 80, height: 40, x: 300, y: 200 },
      ],
      edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
  });

  it('graph with missing node id returns error', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [{ width: 80, height: 40, label: 'No ID' }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
    const text = getErrorText(resp);
    assert.ok(text.includes('id') || text.includes('INVALID'),
      'Error message should mention missing id');
  });

  it('graph with missing node width returns error', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [{ id: 'a', height: 40, label: 'No Width' }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
    const text = getErrorText(resp);
    assert.ok(text.includes('width'), 'Error should mention missing width');
  });

  it('graph with empty children returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: JSON.stringify({ id: 'root', children: [] }) },
    });
    assert.equal(resp.result.isError, true);
  });

  it('graph with no children returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: JSON.stringify({ id: 'root' }) },
    });
    assert.equal(resp.result.isError, true);
  });

  it('graph with edge missing sources returns error', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
      ],
      edges: [{ id: 'e1', targets: ['b'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
  });

  it('graph with edge missing targets returns error', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
      ],
      edges: [{ id: 'e1', sources: ['a'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
  });

  it('graph with edge referencing non-existent node is handled', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [{ id: 'a', width: 80, height: 40 }],
      edges: [{ id: 'e1', sources: ['a'], targets: ['nonexistent'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    // Should either error or handle gracefully — no crash
    assert.ok(resp.result !== undefined, 'Should get a response');
  });

  it('invalid preset name is handled gracefully', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: MINIMAL_GRAPH, preset: 'invalid-preset' },
    });
    assert.ok(resp.result !== undefined, 'Should get a response');
  });

  it('invalid density value is handled gracefully', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: MINIMAL_GRAPH, density: 'super-dense' },
    });
    assert.ok(resp.result !== undefined, 'Should not crash');
  });

  it('negative targetWidthPt handled gracefully', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: MINIMAL_GRAPH, targetWidthPt: -100 },
    });
    assert.ok(resp.result !== undefined, 'Should get a response');
  });

  it('graph with null root returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: 'null' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('prepare_asset with non-existent inputPath returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_prepare_asset',
      arguments: { inputPath: '/nonexistent/image.png' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('prepare_asset with missing inputPath returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_prepare_asset',
      arguments: {},
    });
    assert.equal(resp.result.isError, true);
  });

  it('preview_assets with non-existent manifest returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_preview_assets',
      arguments: { manifestPath: 'nonexistent.json' },
    });
    assert.equal(resp.result.isError, true);
  });
});

// ===========================================================================
// Category 3: Tool invocation order errors
// ===========================================================================

describe('E2E: Tool invocation order and parameter format', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-tikz-e2e-order-'));
    client = createMcpClient(tempDir);
  });

  after(() => { client.destroy(); rmSync(tempDir, { recursive: true, force: true }); });

  it('AGENT MISTAKE: properties.icon needs kind, relativePath, and string width', async () => {
    // Agents pass {icon: {path: 'test.png', width: 32}} but correct format is:
    // {icon: {kind: 'includegraphics', relativePath: 'fig.png', width: '0.5in'}}
    // Key gotchas: (1) 'relativePath' not 'path', (2) width must be string not number,
    // (3) kind is required ('includegraphics' or 'tex')
    const graph = JSON.stringify({
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'layered' },
      children: [
        {
          id: 'node1', width: 80, height: 40, label: 'A',
          properties: { icon: { path: 'test.png', width: 32 } },
        },
        { id: 'node2', width: 80, height: 40, label: 'B' },
      ],
      edges: [{ id: 'e1', sources: ['node1'], targets: ['node2'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true, 'Should fail: icon needs kind field');
    const text = getErrorText(resp);
    assert.ok(text.includes('kind') || text.includes('unsupported'),
      'Error should mention missing kind field');
  });

  it('generate_diagram with layoutOptions as JSON string works', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: {
        graph: MINIMAL_GRAPH,
        layoutOptions: JSON.stringify({ 'elk.spacing.nodeNode': 80 }),
      },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
  });

  it('generate_diagram with styleOptions as JSON string works', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: {
        graph: MINIMAL_GRAPH,
        styleOptions: JSON.stringify({ fontSize: 12 }),
      },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
  });

  it('generate_diagram with all presets succeeds', async () => {
    for (const preset of ['paper-column', 'paper-full', 'slide-16-9', 'slide-4-3']) {
      const resp = await client.request('tools/call', {
        name: 'tikz_generate_diagram',
        arguments: { graph: MINIMAL_GRAPH, preset },
      });
      const result = assertToolSuccess(resp);
      const data = parseResultJson(result);
      assert.equal(data.ok, true, `preset=${preset} should succeed`);
      assert.equal(data.metadata.sizing.preset, preset);
    }
  });

  it('generate_diagram with all density values succeeds', async () => {
    for (const density of ['compact', 'balanced', 'airy']) {
      const resp = await client.request('tools/call', {
        name: 'tikz_generate_diagram',
        arguments: { graph: THREE_NODE_GRAPH, density },
      });
      const result = assertToolSuccess(resp);
      const data = parseResultJson(result);
      assert.equal(data.ok, true, `density=${density} should succeed`);
    }
  });

  it('generate_diagram with large graph (20 nodes) succeeds', async () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`, width: 80, height: 40, label: `Node ${i}`,
    }));
    const edges = [];
    for (let i = 0; i < 19; i++) {
      edges.push({ id: `e${i}`, sources: [`n${i}`], targets: [`n${i + 1}`] });
    }
    const graph = JSON.stringify({ id: 'big', children: nodes, edges });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph, preset: 'paper-full' },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    assert.equal(data.metadata.nodeCount, 20);
  });

  it('generate_diagram with graph exceeding 500 nodes returns error', async () => {
    const nodes = Array.from({ length: 501 }, (_, i) => ({
      id: `n${i}`, width: 80, height: 40,
    }));
    const graph = JSON.stringify({ id: 'huge', children: nodes });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
    const text = getErrorText(resp);
    assert.ok(text.includes('500') || text.includes('GRAPH_TOO_LARGE') || text.includes('nodes'),
      'Error should mention node limit');
  });

  it('render_tikz on valid minimal .tex source', async () => {
    const texContent = [
      '\\documentclass[border=2pt]{standalone}',
      '\\usepackage{tikz}',
      '\\begin{document}',
      '\\begin{tikzpicture}',
      '\\node[draw] (a) at (0,0) {Hello};',
      '\\node[draw] (b) at (3,0) {World};',
      '\\draw[->] (a) -- (b);',
      '\\end{tikzpicture}',
      '\\end{document}',
    ].join('\n');
    writeFileSync(join(tempDir, 'valid.tex'), texContent);
    const resp = await client.request('tools/call', {
      name: 'tikz_render',
      arguments: { sourcePath: 'valid.tex' },
    });
    // May succeed or fail depending on LaTeX availability — but shouldn't crash
    assert.ok(resp.result !== undefined, 'Should get a response');
    if (resp.result.isError) {
      const text = getErrorText(resp);
      assert.ok(text.length > 0, 'Error should have message');
    }
  });
});

// ===========================================================================
// Category 4: Error recovery
// ===========================================================================

describe('E2E: Error recovery (no crashes)', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-tikz-e2e-recovery-'));
    client = createMcpClient(tempDir);
  });

  after(() => { client.destroy(); rmSync(tempDir, { recursive: true, force: true }); });

  it('server survives multiple invalid tool calls', async () => {
    for (let i = 0; i < 5; i++) {
      client.request('tools/call', { name: `nonexistent_${i}`, arguments: {} }).catch(() => {});
    }
    const resp = await client.request('tools/call', {
      name: 'tikz_catalog_search',
      arguments: { query: 'arrow' },
    });
    assert.ok(resp.result, 'Server should survive rapid invalid requests');
  });

  it('generate_diagram with empty graph object returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: '{}' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('generate_diagram with graph containing only layoutOptions returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: JSON.stringify({ id: 'empty', layoutOptions: {} }) },
    });
    assert.equal(resp.result.isError, true);
  });

  it('catalog_search with empty query returns results', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_catalog_search',
      arguments: { query: '' },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.items), 'Should return items array');
  });

  it('catalog_search with very large limit is capped at 50', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_catalog_search',
      arguments: { query: 'a', limit: 999999 },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    assert.ok(data.items.length <= 50, 'Should cap at MAX_LIMIT=50');
  });

  it('unknown tool name returns structured error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_nonexistent_tool',
      arguments: {},
    });
    assert.equal(resp.result.isError, true);
  });

  it('AGENT MISTAKE: multi-source edge not supported', async () => {
    // Agents sometimes create edges with multiple sources, but tikz only supports single-source
    const graph = JSON.stringify({
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
        { id: 'c', width: 80, height: 40 },
      ],
      edges: [{ id: 'e1', sources: ['a', 'b'], targets: ['c'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
    const text = getErrorText(resp);
    assert.ok(text.includes('sources') || text.includes('INVALID'),
      'Error should mention multi-source not supported');
  });

  it('AGENT MISTAKE: multi-target edge not supported', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
        { id: 'c', width: 80, height: 40 },
      ],
      edges: [{ id: 'e1', sources: ['a'], targets: ['b', 'c'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
    const text = getErrorText(resp);
    assert.ok(text.includes('targets') || text.includes('INVALID'),
      'Error should mention multi-target not supported');
  });
});

// ===========================================================================
// Category 5: MCP protocol compliance
// ===========================================================================

describe('E2E: MCP protocol compliance', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-tikz-e2e-protocol-'));
    client = createMcpClient(tempDir);
  });

  after(() => { client.destroy(); rmSync(tempDir, { recursive: true, force: true }); });

  it('initialize returns correct protocol version', async () => {
    const resp = await client.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
    assert.equal(resp.result.protocolVersion, '2024-11-05');
    assert.ok(resp.result.capabilities?.tools, 'Should advertise tools capability');
    assert.equal(resp.result.serverInfo.name, 'tikz-helper');
  });

  it('tools/list returns exactly 5 tools with correct names', async () => {
    const resp = await client.request('tools/list');
    const tools = resp.result.tools;
    assert.equal(tools.length, 5);
    const names = tools.map(t => t.name);
    assert.deepEqual(names, [
      'tikz_catalog_search',
      'tikz_prepare_asset',
      'tikz_render',
      'tikz_generate_diagram',
      'tikz_preview_assets',
    ]);
  });

  it('each tool has name, description, and inputSchema', async () => {
    const resp = await client.request('tools/list');
    for (const tool of resp.result.tools) {
      assert.ok(typeof tool.name === 'string' && tool.name.length > 0);
      assert.ok(typeof tool.description === 'string' && tool.description.length > 0);
      assert.ok(tool.inputSchema, `${tool.name} should have inputSchema`);
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  it('tikz_generate_diagram schema: graph is required string', async () => {
    const resp = await client.request('tools/list');
    const genTool = resp.result.tools.find(t => t.name === 'tikz_generate_diagram');
    assert.ok(genTool);
    assert.ok(genTool.inputSchema.required?.includes('graph'));
    assert.equal(genTool.inputSchema.properties.graph.type, 'string');
  });

  it('tikz_render schema: sourcePath is required string', async () => {
    const resp = await client.request('tools/list');
    const renderTool = resp.result.tools.find(t => t.name === 'tikz_render');
    assert.ok(renderTool);
    assert.ok(renderTool.inputSchema.required?.includes('sourcePath'));
  });

  it('tikz_prepare_asset schema: inputPath is required string', async () => {
    const resp = await client.request('tools/list');
    const prepTool = resp.result.tools.find(t => t.name === 'tikz_prepare_asset');
    assert.ok(prepTool);
    assert.ok(prepTool.inputSchema.required?.includes('inputPath'));
  });

  it('call with missing method returns JSON-RPC error', async () => {
    const resp = await client.request('nonexistent_method', {});
    assert.ok(resp.error, 'Should return JSON-RPC error');
  });
});

// ===========================================================================
// Category 6: Edge cases agents commonly hit
// ===========================================================================

describe('E2E: Common agent edge cases', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-tikz-e2e-edge-'));
    client = createMcpClient(tempDir);
  });

  after(() => { client.destroy(); rmSync(tempDir, { recursive: true, force: true }); });

  it('generate_diagram with graph as number returns clear error', async () => {
    // After fix: type guard catches non-string before JSON.parse
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: 42 },
    });
    assert.equal(resp.result.isError, true);
    const text = getErrorText(resp);
    assert.ok(text.includes('JSON string'), 'Should mention JSON string requirement');
  });

  it('generate_diagram with graph as array returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: '[]' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('generate_diagram with graph as string literal returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph: '"just a string"' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('generate_diagram with node having negative width returns error', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [{ id: 'a', width: -10, height: 40 }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
    const text = getErrorText(resp);
    assert.ok(text.includes('width'), 'Error should mention width must be positive');
  });

  it('generate_diagram with node having zero width returns error', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [{ id: 'a', width: 0, height: 40 }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
  });

  it('generate_diagram with node having string width returns error', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [{ id: 'a', width: 'big', height: 40 }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
  });

  it('generate_diagram with graph root having non-string id returns error', async () => {
    const graph = JSON.stringify({
      id: 123,
      children: [{ id: 'a', width: 80, height: 40 }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
  });

  it('generate_diagram with graph root having empty string id returns error', async () => {
    const graph = JSON.stringify({
      id: '',
      children: [{ id: 'a', width: 80, height: 40 }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    assert.equal(resp.result.isError, true);
  });

  it('generate_diagram with group nodes works', async () => {
    const graph = JSON.stringify({
      id: 'root',
      children: [
        {
          id: 'group1',
          children: [
            { id: 'a', width: 80, height: 40, label: 'A' },
            { id: 'b', width: 80, height: 40, label: 'B' },
          ],
        },
        { id: 'c', width: 80, height: 40, label: 'C' },
      ],
      edges: [{ id: 'e1', sources: ['group1'], targets: ['c'] }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
  });

  it('node.shape is now accepted on root (fallback to properties.shape)', async () => {
    // After fix: compileNodeStyle() accepts both node.properties.shape AND node.shape.
    // The graph has {shape: 'diamond'} and {shape: 'stadium'} on root — should render.
    const graph = JSON.stringify({
      id: 'root',
      children: [
        { id: 'start', width: 80, height: 40, shape: 'stadium' },
        { id: 'decision', width: 80, height: 80, shape: 'diamond' },
        { id: 'end', width: 80, height: 40, shape: 'stadium' },
      ],
      edges: [
        { id: 'e1', sources: ['start'], targets: ['decision'] },
        { id: 'e2', sources: ['decision'], targets: ['end'] },
      ],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    assert.ok(data.tikz.includes('diamond'),
      'node.shape diamond is now accepted as fallback');
    assert.ok(data.tikz.includes('rounded corners'),
      'node.shape stadium is now accepted as fallback');
  });

  it('edge.style and edge.label now accepted on root (fallback to properties)', async () => {
    // After fix: compileEdgeStyle() and edgeLabel() accept both edge.properties
    // AND edge.style/edge.label as fallbacks.
    const graph = JSON.stringify({
      id: 'root',
      children: [
        { id: 'a', width: 80, height: 40 },
        { id: 'b', width: 80, height: 40 },
      ],
      edges: [{
        id: 'e1', sources: ['a'], targets: ['b'],
        style: { line: 'dashed', stroke: '#ff0000' },
        label: 'connects',
      }],
    });
    const resp = await client.request('tools/call', {
      name: 'tikz_generate_diagram',
      arguments: { graph },
    });
    const result = assertToolSuccess(resp);
    const data = parseResultJson(result);
    assert.equal(data.ok, true);
    // edge.style is now accepted as fallback — 'dashed' should appear
    assert.ok(data.tikz.includes('dashed'),
      'edge.style.line is now accepted as fallback — dashed should render');
    // edge.label is now accepted as fallback — 'connects' should appear
    assert.ok(data.tikz.includes('connects'),
      'edge.label is now accepted as fallback — connects should render');
  });

  it('prepare_asset with directory traversal path returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_prepare_asset',
      arguments: { inputPath: '../../../etc/passwd' },
    });
    assert.equal(resp.result.isError, true);
  });

  it('prepare_asset with absolute path outside project returns error', async () => {
    const resp = await client.request('tools/call', {
      name: 'tikz_prepare_asset',
      arguments: { inputPath: '/tmp/outside-project/image.png' },
    });
    assert.equal(resp.result.isError, true);
  });
});
