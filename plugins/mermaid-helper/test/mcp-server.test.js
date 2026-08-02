import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_SERVER = join(__dirname, '..', 'mcp-server.js');

describe('mermaid-helper MCP server', () => {
  let child;
  let tempDir;
  /** Lines received from child stdout, indexed by id */
  const responses = new Map();
  let lineBuffer = [];
  let stdoutBuffer = '';

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-mermaid-mcp-test-'));
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
        stdoutBuffer = '';

        child.stdout.on('data', (chunk) => {
          // Buffer partial lines: a single response can arrive split across
          // chunks, and a mid-line split must not drop the message.
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() ?? '';
          const complete = lines.filter((line) => line.trim() !== '');
          for (const line of complete) {
            try {
              const msg = JSON.parse(line);
              if (msg.id != null) {
                responses.set(msg.id, msg);
              }
            } catch {
              // ignore parse errors from other output
            }
          }
          lineBuffer.push(...complete);
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
      let settled = false;
      const poll = () => {
        if (settled) return;
        if (responses.has(id)) {
          settled = true;
          resolve(responses.get(id));
        } else {
          setTimeout(poll, 10);
        }
      };
      setTimeout(poll, 10);

      // Safety timeout — stop polling so a lost response cannot hang the process
      setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Timeout waiting for response to id=${id}`));
      }, 5000);
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
    assert.equal(resp.result.serverInfo.name, 'mermaid-helper');
  });

  it('responds to tools/list with 1 tool', async () => {
    // Send initialized notification (no response expected)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const resp = await request(2, 'tools/list');
    assert.equal(resp.id, 2);
    assert.ok(resp.result, 'tools/list must return a result');
    const tools = resp.result.tools;
    assert.ok(Array.isArray(tools), 'tools must be an array');
    assert.equal(tools.length, 1, 'must have exactly 1 tool');

    const names = tools.map((t) => t.name);
    assert.deepEqual(names, ['mermaid_render'], 'tool names must match expected order');

    // All tools must have name, description, inputSchema
    for (const tool of tools) {
      assert.ok(typeof tool.name === 'string' && tool.name.length > 0, `tool ${tool.name}: name required`);
      assert.ok(typeof tool.description === 'string' && tool.description.length > 0, `tool ${tool.name}: description required`);
      assert.ok(tool.inputSchema && typeof tool.inputSchema === 'object', `tool ${tool.name}: inputSchema required`);
    }

    // mermaid_render: frozen param surface, source XOR sourcePath, no targetBase
    const mermaidTool = tools.find((t) => t.name === 'mermaid_render');
    assert.ok(mermaidTool, 'mermaid_render must be listed');
    assert.equal(mermaidTool.inputSchema.type, 'object');
    assert.deepEqual(mermaidTool.inputSchema.properties.theme.enum, ['default', 'forest', 'dark', 'neutral']);
    assert.equal(Object.hasOwn(mermaidTool.inputSchema.properties, 'source'), true);
    assert.equal(Object.hasOwn(mermaidTool.inputSchema.properties, 'sourcePath'), true);
    assert.equal(Object.hasOwn(mermaidTool.inputSchema.properties, 'outputDirectory'), true);
    assert.equal(Object.hasOwn(mermaidTool.inputSchema.properties, 'width'), true);
    assert.equal(Object.hasOwn(mermaidTool.inputSchema.properties, 'timeoutMs'), true);
    assert.equal(Object.hasOwn(mermaidTool.inputSchema.properties, 'targetBase'), false, 'targetBase must not exist');
    assert.equal(mermaidTool.inputSchema.required, undefined, 'source XOR sourcePath is validated in code, not in required');
  });

  it('mermaid_render with neither source nor sourcePath returns a structured error', async () => {
    const resp = await request(3, 'tools/call', {
      name: 'mermaid_render',
      arguments: {},
    });
    assert.equal(resp.id, 3);
    assert.ok(resp.result, 'must return a result');
    assert.equal(resp.result.isError, true, 'neither source nor sourcePath must error');
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

  it('mermaid_render rejects a traversing sourcePath via path policy', async () => {
    const resp = await request(5, 'tools/call', {
      name: 'mermaid_render',
      arguments: { sourcePath: '../escape.mmd' },
    });
    assert.equal(resp.id, 5);
    assert.ok(resp.result, 'must return a result');
    assert.equal(resp.result.isError, true, 'traversing sourcePath must error');
    const first = resp.result.content[0];
    assert.equal(first.type, 'text');
    assert.ok(first.text.includes('PATH_OUTSIDE_PROJECT'), `error must carry the code: ${first.text}`);
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
