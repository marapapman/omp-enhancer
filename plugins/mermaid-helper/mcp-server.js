#!/usr/bin/env node

/**
 * Standalone MCP server for mermaid-helper tools.
 *
 * Exposes the mermaid_render tool over the
 * Model Context Protocol (MCP) using stdio transport.
 *
 * No OMP runtime required. The server imports the same core functions
 * that the OMP plugin registration wraps.
 *
 * Usage:
 *   node mcp-server.js
 *   OMP_PROJECT_ROOT=/path/to/project node mcp-server.js
 *
 * Configure in any MCP client's mcp.json:
 *   {
 *     "mcpServers": {
 *       "mermaid-helper": {
 *         "command": "node",
 *         "args": ["<path-to>/mcp-server.js"],
 *         "timeout": 120000
 *       }
 *     }
 *   }
 */

import { renderMermaid } from './src/mermaid-render.js';
import { createInterface } from 'node:readline';
import { stdin, stdout, stderr, exit } from 'node:process';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function objectParams(params) {
  return params && typeof params === 'object' && !Array.isArray(params) ? params : {};
}

function resolveProjectRoot() {
  return process.env.OMP_PROJECT_ROOT && process.env.OMP_PROJECT_ROOT.trim() !== ''
    ? process.env.OMP_PROJECT_ROOT
    : process.cwd();
}

function toContent(data) {
  return { type: 'text', text: JSON.stringify(data, null, 2) };
}

function mcpError(msg) {
  return { content: [toContent(msg)], isError: true };
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema input)
// ---------------------------------------------------------------------------

const TOOL_DEFS = [
  {
    name: 'mermaid_render',
    description: 'Validate Mermaid source (inline or project .mmd/.md) and run the pinned mermaid-cli in an isolated temporary workspace with offline, sandboxed headless Chrome, then publish revision-bound SVG evidence. Never hand-edit SVG coordinates.',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePath: { type: 'string', description: 'Path to the Mermaid .mmd or .md source file to render. Provide exactly one of source or sourcePath.' },
        source: { type: 'string', description: 'Inline Mermaid source text. Provide exactly one of source or sourcePath.' },
        outputDirectory: { type: 'string', description: 'Directory for output files. Defaults to figures/mermaid/rendered.' },
        theme: { type: 'string', enum: ['default', 'forest', 'dark', 'neutral'], description: 'Mermaid theme. Defaults to default.' },
        width: { type: 'number', description: 'Optional output width in pixels for the rendered SVG.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds for the render process.' },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const HANDLERS = {
  async mermaid_render(params) {
    const projectRoot = resolveProjectRoot();
    return await renderMermaid(
      { ...objectParams(params), projectRoot },
      {},
    );
  },
};

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 over stdio (MCP transport)
// ---------------------------------------------------------------------------

function writeResponse(id, result) {
  stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function writeError(id, code, message) {
  stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    writeResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mermaid-helper', version: '0.4.2' },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    // Notification — no response expected.
    return;
  }

  if (method === 'tools/list') {
    writeResponse(id, { tools: TOOL_DEFS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};
    const handler = HANDLERS[toolName];

    if (!handler) {
      writeResponse(id, mcpError(`Unknown tool: ${toolName}`));
      return;
    }

    try {
      const result = await handler(args);
      writeResponse(id, { content: [toContent(result)] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error.code ? `[${error.code}] ` : '';
      writeResponse(id, mcpError(`${code}${message}`));
    }
    return;
  }

  // Unknown method
  writeError(id, -32601, `Method not found: ${method}`);
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

// Sequential async main loop using for-await (readline supports async iteration).
// This ensures each request is fully processed before the next one starts,
// and the loop naturally exits when stdin closes.
(async () => {
  const rl = createInterface({ input: stdin });

  for await (const line of rl) {
    try {
      const msg = JSON.parse(line);
      if (msg && typeof msg === 'object') {
        await handleRequest(msg);
      }
    } catch (err) {
      stderr.write(`mcp-server: failed to parse request: ${err.message}\n`);
    }
  }

  exit(0);
})();

process.on('SIGTERM', () => exit(0));
process.on('SIGINT', () => exit(0));
