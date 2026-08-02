import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
    let stdoutBuffer = '';
    child.stdout.on('data', (chunk) => {
      // Buffer partial lines: a single response can arrive split across
      // chunks, and a mid-line split must not drop the message.
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') continue;
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
        reject(new Error(`Timeout waiting for id=${id}`));
      }, 10000);
    });
  }

  function destroy() {
    if (child && !child.killed) child.kill();
  }

  return { request, destroy };
}

function getErrorText(resp) {
  const content = resp?.result?.content;
  if (Array.isArray(content) && content.length > 0 && content[0]?.type === 'text') {
    return content[0].text;
  }
  return '';
}

function parseResultJson(result) {
  return JSON.parse(result.content[0].text);
}

// ===========================================================================
// E2E: MCP protocol compliance
// ===========================================================================

describe('E2E: MCP protocol compliance', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-mermaid-e2e-protocol-'));
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
    assert.equal(resp.result.serverInfo.name, 'mermaid-helper');
  });

  it('tools/list returns exactly 1 tool with the correct name', async () => {
    const resp = await client.request('tools/list');
    const tools = resp.result.tools;
    assert.equal(tools.length, 1);
    const names = tools.map(t => t.name);
    assert.deepEqual(names, ['mermaid_render']);
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

  it('mermaid_render schema: source XOR sourcePath, frozen theme enum, no targetBase', async () => {
    const resp = await client.request('tools/list');
    const tool = resp.result.tools.find(t => t.name === 'mermaid_render');
    assert.ok(tool);
    assert.deepEqual(tool.inputSchema.properties.theme.enum, ['default', 'forest', 'dark', 'neutral']);
    assert.equal(tool.inputSchema.properties.source.type, 'string');
    assert.equal(tool.inputSchema.properties.sourcePath.type, 'string');
    assert.equal(tool.inputSchema.required, undefined, 'source XOR sourcePath is validated in code, not in required');
    assert.equal(tool.inputSchema.properties.targetBase, undefined, 'targetBase must not exist');
  });

  it('mermaid_render without source or sourcePath returns a structured INVALID_PARAMETER error', async () => {
    const resp = await client.request('tools/call', {
      name: 'mermaid_render',
      arguments: {},
    });
    assert.equal(resp.result.isError, true, 'neither source nor sourcePath must error');
    const text = getErrorText(resp);
    assert.ok(text.includes('INVALID_PARAMETER'), `error must carry the code: ${text}`);
    assert.ok(/source/i.test(text), 'error must mention source');
  });

  it('mermaid_render with both source and sourcePath returns a structured error', async () => {
    const resp = await client.request('tools/call', {
      name: 'mermaid_render',
      arguments: { source: 'graph TD; A-->B;', sourcePath: 'flow.mmd' },
    });
    assert.equal(resp.result.isError, true, 'both source and sourcePath must error');
    assert.ok(getErrorText(resp).includes('INVALID_PARAMETER'));
  });

  it('mermaid_render with traversing sourcePath returns PATH_OUTSIDE_PROJECT', async () => {
    const resp = await client.request('tools/call', {
      name: 'mermaid_render',
      arguments: { sourcePath: '../escape.mmd' },
    });
    assert.equal(resp.result.isError, true);
    assert.ok(getErrorText(resp).includes('PATH_OUTSIDE_PROJECT'));
  });

  it('mermaid_render with sourcePath outside the project root is rejected', async () => {
    const resp = await client.request('tools/call', {
      name: 'mermaid_render',
      arguments: { sourcePath: '/tmp/outside-project/flow.mmd' },
    });
    assert.equal(resp.result.isError, true, 'absolute path outside project must error');
  });

  it('call with missing method returns JSON-RPC error', async () => {
    const resp = await client.request('nonexistent_method', {});
    assert.ok(resp.error, 'Should return JSON-RPC error');
  });
});

// ===========================================================================
// E2E: Error recovery (no crashes)
// ===========================================================================

describe('E2E: Error recovery', () => {
  let client;
  let tempDir;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'omp-mermaid-e2e-recovery-'));
    client = createMcpClient(tempDir);
  });

  after(() => { client.destroy(); rmSync(tempDir, { recursive: true, force: true }); });

  it('unknown tool name returns structured error', async () => {
    const resp = await client.request('tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    });
    assert.equal(resp.result.isError, true);
  });

  it('server survives multiple invalid tool calls', async () => {
    for (let i = 0; i < 5; i += 1) {
      const resp = await client.request('tools/call', {
        name: 'mermaid_render',
        arguments: { sourcePath: '../escape.mmd' },
      });
      assert.equal(resp.result.isError, true);
    }
    const resp = await client.request('tools/list');
    assert.equal(resp.result.tools.length, 1, 'server must still respond after repeated errors');
  });

  it('mermaid_render with malformed parameters never crashes the server', async () => {
    const resp = await client.request('tools/call', {
      name: 'mermaid_render',
      arguments: { theme: 'not-a-theme', source: 'graph TD; A-->B;' },
    });
    assert.equal(resp.result.isError, true);
    assert.ok(getErrorText(resp).includes('INVALID_PARAMETER'));
    const list = await client.request('tools/list');
    assert.equal(list.result.tools.length, 1, 'server must still respond');
  });
});
