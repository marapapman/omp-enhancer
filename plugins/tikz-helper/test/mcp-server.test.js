import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = join(__dirname, '..', 'mcp-server.js');

describe('tikz-helper MCP server', () => {
  let child;
  let tempDir;
  /** Lines received from child stdout, indexed by id */
  const responses = new Map();
  let lineBuffer = [];

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-tikz-mcp-test-'));
  });

  after(() => {
    if (child && !child.killed) {
      child.kill();
    }
  });

  /**
   * Send a JSON-RPC request to the MCP server and return the response.
   * @param {number} id
   * @param {string} method
   * @param {object} [params]
   * @returns {Promise<object>}
   */
  function request(id, method, params) {
    return new Promise((resolve, reject) => {
      if (!child || child.killed) {
        // Spawn fresh for each test group
        child = spawn(process.execPath, [MCP_SERVER], {
          env: { ...process.env, OMP_PROJECT_ROOT: tempDir },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        lineBuffer = [];
        responses.clear();

        child.stdout.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const msg = JSON.parse(line);
              if (msg.id != null) {
                responses.set(msg.id, msg);
              }
            } catch {
              // ignore parse errors from other output
            }
          }
          lineBuffer.push(...lines);
        });

        child.stderr.on('data', () => {
          // ignore stderr diagnostics
        });

        child.on('error', reject);
      }

      const msg = { jsonrpc: '2.0', id, method };
      if (params !== undefined) msg.params = params;
      child.stdin.write(JSON.stringify(msg) + '\n');

      // Poll for the response — the server responds synchronously per request
      const poll = () => {
        if (responses.has(id)) {
          resolve(responses.get(id));
        } else {
          setTimeout(poll, 10);
        }
      };
      setTimeout(poll, 10);

      // Safety timeout
      setTimeout(() => reject(new Error(`Timeout waiting for response to id=${id}`)), 5000);
    });
  }

  it('responds to initialize', async () => {
    const resp = await request(1, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    assert.equal(resp.jsonrpc, '2.0');
    assert.equal(resp.id, 1);
    assert.ok(resp.result, 'initialize must return a result');
    assert.equal(resp.result.protocolVersion, '2024-11-05');
    assert.ok(resp.result.capabilities.tools, 'must declare tools capability');
    assert.equal(resp.result.serverInfo.name, 'tikz-helper');
  });

  it('responds to tools/list with 5 tools', async () => {
    // Send initialized notification (no response expected)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const resp = await request(2, 'tools/list');
    assert.equal(resp.id, 2);
    assert.ok(resp.result, 'tools/list must return a result');
    const tools = resp.result.tools;
    assert.ok(Array.isArray(tools), 'tools must be an array');
    assert.equal(tools.length, 5, 'must have exactly 5 tools');

    const names = tools.map((t) => t.name);
    assert.deepEqual(names, [
      'tikz_catalog_search',
      'tikz_prepare_asset',
      'tikz_render',
      'tikz_generate_diagram',
      'tikz_preview_assets',
    ], 'tool names must match expected order');

    // All tools must have name, description, inputSchema
    for (const tool of tools) {
      assert.ok(typeof tool.name === 'string' && tool.name.length > 0, `tool ${tool.name}: name required`);
      assert.ok(typeof tool.description === 'string' && tool.description.length > 0, `tool ${tool.name}: description required`);
      assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `tool ${tool.name}: inputSchema required`);
    }
  });

  it('tikz_catalog_search with query returns results', async () => {
    const resp = await request(3, 'tools/call', {
      name: 'tikz_catalog_search',
      arguments: { query: 'rectangle' },
    });
    assert.equal(resp.id, 3);
    assert.ok(resp.result, 'must return a result');
    // Catalog search should not be an error
    assert.ok(!resp.result.isError, 'catalog search must not error');
    assert.ok(Array.isArray(resp.result.content), 'must have content array');
    const first = resp.result.content[0];
    assert.equal(first.type, 'text');
    const data = JSON.parse(first.text);
    assert.ok(data.ok !== false, 'response should indicate success');
  });

  it('unknown tool name returns error', async () => {
    const resp = await request(4, 'tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    });
    assert.equal(resp.id, 4);
    assert.ok(resp.result, 'must return a result');
    assert.equal(resp.result.isError, true, 'unknown tool must error');
  });

  it('tikz_generate_diagram with minimal graph succeeds when elkjs is available', async () => {
    // Check if elkjs is importable — skip if not
    let elkAvailable = false;
    try {
      const { checkElkEnvironment } = await import('../src/elk-layout.js');
      const r = await checkElkEnvironment();
      elkAvailable = r.available;
    } catch {
      elkAvailable = false;
    }

    if (!elkAvailable) {
      // Write a minimal .elk.json to simulate success if elkjs unavailable
      // The tool will fail with ELK_NOT_INSTALLED — that's expected behavior
      const resp = await request(5, 'tools/call', {
        name: 'tikz_generate_diagram',
        arguments: {
          graph: JSON.stringify({
            id: 'root',
            children: [{ id: 'a', width: 40, height: 20 }],
            edges: [],
          }),
        },
      });
      assert.equal(resp.id, 5);
      assert.ok(resp.result, 'must return a result');
      const first = resp.result.content[0];
      assert.equal(first.type, 'text');
      const data = JSON.parse(first.text);
      // Either error free (ELK available) or specific ELK error
      if (resp.result.isError) {
        assert.ok(data.code === 'ELK_NOT_INSTALLED' || data.error, 'error should be ELK not installed or other runtime error');
      }
      return;
    }

    const resp = await request(5, 'tools/call', {
      name: 'tikz_generate_diagram',
      arguments: {
        graph: JSON.stringify({
          id: 'root',
          children: [{ id: 'a', width: 40, height: 20 }],
          edges: [],
        }),
      },
    });
    assert.equal(resp.id, 5);
    assert.ok(resp.result, 'must return a result');
    assert.ok(!resp.result.isError, 'generate_diagram must not error');
    const first = resp.result.content[0];
    assert.equal(first.type, 'text');
    const data = JSON.parse(first.text);
    assert.ok(typeof data.tikz === 'string' && data.tikz.length > 0, 'response must include tikz source string');
    assert.ok(data.tikz.includes('{tikzpicture}'), 'tikz source must contain tikzpicture environment');
  });

  it('handles malformed JSON gracefully without crashing', () => {
    return new Promise((resolve, reject) => {
      child.stdin.write('not valid json\n');

      // Give it a moment, then check the server is still alive
      setTimeout(() => {
        // Send a valid request to confirm the server is still running
        request(6, 'tools/list').then((resp) => {
          assert.equal(resp.id, 6);
          assert.ok(resp.result.tools, 'server must still respond after malformed input');
          resolve();
        }).catch(reject);
      }, 200);
    });
  });
});
