#!/usr/bin/env node

/**
 * Standalone MCP server for tikz-helper tools.
 *
 * Exposes the 5 tikz_* tools (tikz_catalog_search, tikz_prepare_asset,
 * tikz_render, tikz_generate_diagram, tikz_preview_assets) over the
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
 *       "tikz-helper": {
 *         "command": "node",
 *         "args": ["<path-to>/mcp-server.js"],
 *         "timeout": 120000
 *       }
 *     }
 *   }
 */

import { generateTikz } from './index.js';
import { searchCatalog } from './src/catalog-search.js';
import { renderTikz } from './src/render-tikz.js';
import { prepareAsset } from './src/asset-prepare.js';
import { previewAssetPreviews } from './index.js';
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
    name: 'tikz_catalog_search',
    description: 'Search the packaged, version-pinned OpenTikZ catalog and return safe copy sources without modifying the vendor snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Semantic search term for OpenTikZ icons, templates, or examples.' },
        type: { type: 'string', enum: ['icon', 'template', 'example'], description: 'Filter by catalog entry type: icon, template, or example.' },
        domain: { type: 'string', description: 'Filter by domain or category within the catalog.' },
        limit: { type: 'number', description: 'Maximum number of results to return.' },
        includeSource: { type: 'boolean', description: 'If true, include the full source content in results.' },
      },
    },
  },
  {
    name: 'tikz_prepare_asset',
    description: 'Normalize an existing PNG, JPEG, or WebP as a metadata-free, content-addressed PNG inside the project and merge its provenance manifest. This tool never generates an image or uses the network.',
    inputSchema: {
      type: 'object',
      properties: {
        inputPath: { type: 'string', description: 'Path to the PNG, JPEG, or WebP image file to normalize.' },
        outputDirectory: { type: 'string', description: 'Output directory for the normalized asset. Defaults to figures/tikz/assets/.' },
        nodeId: { type: 'string', description: 'Node ID to associate with this asset in the manifest.' },
        prompt: { type: 'string', description: 'The generation prompt used if the image was AI-generated.' },
        provider: { type: 'string', description: 'The image provider used (e.g., openai, replicate).' },
        model: { type: 'string', description: 'The model name used for generation.' },
      },
      required: ['inputPath'],
    },
  },
  {
    name: 'tikz_render',
    description: 'Validate and compile a project-local standalone TikZ source with fixed commands in an isolated temporary workspace, then publish revision-bound PDF, SVG, full PNG, and 60%-scale PNG evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        sourcePath: { type: 'string', description: 'Path to the TikZ .tex source file to compile and render.' },
        outputDirectory: { type: 'string', description: 'Directory for output files. Defaults to the same directory as the source file.' },
        timeoutMs: { type: 'number', description: 'Timeout in milliseconds for the render process.' },
      },
      required: ['sourcePath'],
    },
  },
  {
    name: 'tikz_generate_diagram',
    description: 'Accept a diagram IR in ELK JSON format (graph with nodes, edges, ports, and layout options), compute automatic layout via Eclipse Layout Kernel, and generate compilable TikZ source code. The output .tex can be rendered with tikz_render. Supports paper-column, paper-full, and slide presets with density tuning and sizing metadata.',
    inputSchema: {
      type: 'object',
      properties: {
                graph: { type: 'string', description: 'A JSON string of the ELK graph IR. Use JSON.stringify() to convert your graph object. Must include id, children, width, height. Input nodes must omit x and y (the layout engine computes positions). Size each node width and height to fit its exact label plus padding (2pt inner padding applied).' },
                layoutOptions: { type: 'string', description: 'Optional JSON string of ELK layout options. Use JSON.stringify() to convert your options object. Place elk.algorithm and layout options here. Choose elk.algorithm: layered (flows), mrtree (trees), radial (mind-map), stress, or force. Set elk.direction to RIGHT or DOWN. Fix overlaps by changing layout options or node sizes and regenerating. Example: {"elk.algorithm":"layered","elk.direction":"RIGHT"}' },
                styleOptions: { type: 'string', description: 'Optional JSON string of TikZ style options. Use JSON.stringify() to convert your style object. Use - for no arrow, dashed or dotted for line style. Set arrow type with properties.arrow: ->, <-, or <->.' },
        preset: { type: 'string', enum: ['paper-column', 'paper-full', 'slide-16-9', 'slide-4-3'], description: 'Target medium preset: paper-column (double-column paper, ~240pt), paper-full (full text width, ~504pt), slide-16-9, or slide-4-3.' },
        density: { type: 'string', enum: ['compact', 'balanced', 'airy'], description: 'Density tuning: compact (tight), balanced (default), or airy (spacious).' },
        targetWidthPt: { type: 'number', description: 'Optional target width in points for scaling the diagram.' },
      },
      required: ['graph'],
    },
  },
  {
    name: 'tikz_preview_assets',
    description: 'Preview icon assets from an asset manifest for visioner review. Writes previews to temporary directory only, never to project files.',
    inputSchema: {
      type: 'object',
      properties: {
        manifestPath: { type: 'string', description: 'Path to the asset manifest JSON file. Defaults to figures/tikz/assets/assets.manifest.json.' },
        nodeIds: { type: 'array', items: { type: 'string' }, description: 'Optional array of node IDs to filter which assets to preview.' },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const HANDLERS = {
  async tikz_catalog_search(params) {
    return await searchCatalog(objectParams(params));
  },

  async tikz_prepare_asset(params) {
    const projectRoot = resolveProjectRoot();
    return await prepareAsset(
      { ...objectParams(params), projectRoot },
      {},
    );
  },

  async tikz_render(params) {
    const projectRoot = resolveProjectRoot();
    return await renderTikz(
      { ...objectParams(params), projectRoot },
      {},
    );
  },

  async tikz_generate_diagram(params) {
    if (typeof params.graph !== 'string') {
      throw new Error('graph parameter must be a JSON string, not an object or other type. Use JSON.stringify() to convert your graph object to a string before passing it.');
    }
    const graph = JSON.parse(params.graph);
    const parsed = { graph };
    if (params.layoutOptions) parsed.layoutOptions = JSON.parse(params.layoutOptions);
    if (params.styleOptions) parsed.tikzOptions = JSON.parse(params.styleOptions);
    if (params.preset) parsed.preset = params.preset;
    if (params.density) parsed.density = params.density;
    if (typeof params.targetWidthPt === 'number') parsed.targetWidthPt = params.targetWidthPt;
    return await generateTikz(parsed);
  },

  async tikz_preview_assets(params) {
    const projectRoot = resolveProjectRoot();
    return await previewAssetPreviews(
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
      serverInfo: { name: 'tikz-helper', version: '0.3.3' },
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
