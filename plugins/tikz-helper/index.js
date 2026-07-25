import { prepareAsset } from './src/asset-prepare.js';
import { searchCatalog } from './src/catalog-search.js';
import { renderTikz, runBoundedCommand } from './src/render-tikz.js';
import { generateTikz, computeLayout, elkToTikz } from './src/generate-tikz.js';
import { asRuntimeError } from './src/runtime-error.js';

function optional(z, schema) {
  return typeof z.optional === 'function' ? z.optional(schema) : schema.optional();
}

function objectParams(params) {
  return params && typeof params === 'object' && !Array.isArray(params) ? params : {};
}

function projectRoot(ctx) {
  return typeof ctx?.cwd === 'string' && ctx.cwd.trim() !== '' ? ctx.cwd : process.cwd();
}

function textContent(value) {
  return { type: 'text', text: JSON.stringify(value, null, 2) };
}

function successResponse(details) {
  return {
    content: [textContent(details)],
    details,
    isError: false,
  };
}

function errorResponse(error) {
  const runtimeError = asRuntimeError(error);
  const details = {
    ok: false,
    code: runtimeError.code,
    error: runtimeError.message,
    ...(Object.keys(runtimeError.details).length > 0 ? { context: runtimeError.details } : {}),
  };
  return {
    content: [textContent(details)],
    details,
    isError: true,
  };
}

function catalogParameters(z) {
  return z.object({
    query: optional(z, z.string()),
    type: optional(z, z.enum(['icon', 'template', 'example'])),
    domain: optional(z, z.string()),
    limit: optional(z, z.number()),
    includeSource: optional(z, z.boolean()),
  });
}

function assetParameters(z) {
  return z.object({
    inputPath: z.string(),
    outputDirectory: optional(z, z.string()),
    nodeId: optional(z, z.string()),
    prompt: optional(z, z.string()),
    provider: optional(z, z.string()),
    model: optional(z, z.string()),
  });
}

function renderParameters(z) {
  return z.object({
    sourcePath: z.string(),
    outputDirectory: optional(z, z.string()),
    timeoutMs: optional(z, z.number()),
  });
}
function generateParameters(z) {
  return z.object({
    graph: z.string(),
    layoutOptions: optional(z, z.string()),
    styleOptions: optional(z, z.string()),
  });
}


export { generateTikz, computeLayout, elkToTikz };
export { prepareAsset } from './src/asset-prepare.js';
export { searchCatalog } from './src/catalog-search.js';
export { renderTikz, runBoundedCommand } from './src/render-tikz.js';
export { checkElkEnvironment, ELK_INSTALL_GUIDANCE } from './src/elk-layout.js';

export default function registerTikzHelper(omp) {
  const z = omp.zod.z;
  omp.setLabel?.('TikZ Helper');

  omp.registerTool({
    name: 'tikz_catalog_search',
    label: 'OpenTikZ Catalog Search',
    description: 'Search the packaged, version-pinned OpenTikZ catalog and return safe copy sources without modifying the vendor snapshot.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Search packaged OpenTikZ icons, templates, and examples by semantic terms.',
    promptGuidelines: [
      'Use includeSource only for the small set of selected entries that Main intends to copy before editing.',
      'Treat the returned vendor paths and content as read-only source material.',
    ],
    parameters: catalogParameters(z),
    async execute(_toolCallId, params) {
      try {
        return successResponse(await searchCatalog(objectParams(params)));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });

  omp.registerTool({
    name: 'tikz_prepare_asset',
    label: 'Prepare TikZ Node Asset',
    description: 'Normalize an existing PNG, JPEG, or WebP as a metadata-free, content-addressed PNG inside the project and merge its provenance manifest. This tool never generates an image or uses the network.',
    defaultInactive: true,
    approval: 'exec',
    promptSnippet: 'Import and normalize an already-produced node icon for a TikZ figure.',
    promptGuidelines: [
      'Call image generation separately only when the current native tool is available and the user has authorized it.',
      'Pass the resulting local image path here; never reference an image-generation temporary path from final TeX.',
      'Keep labels in TikZ rather than baking text into the raster asset.',
    ],
    parameters: assetParameters(z),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        return successResponse(await prepareAsset({
          ...objectParams(params),
          projectRoot: projectRoot(ctx),
        }, { signal }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });

  omp.registerTool({
    name: 'tikz_render',
    label: 'Render TikZ Figure',
    description: 'Validate and compile a project-local standalone TikZ source with fixed commands in an isolated temporary workspace, then publish revision-bound PDF, SVG, full PNG, and 60%-scale PNG evidence.',
    defaultInactive: true,
    approval: 'exec',
    promptSnippet: 'Compile and render a safe project-local TikZ source for current-revision review.',
    promptGuidelines: [
      'This tool accepts no command or executable parameter and always disables shell escape.',
      'Use both returned raster artifacts for independent full-size and reduced-scale visual review.',
      'The structured evidence reports execution facts only and does not decide completion.',
    ],
    parameters: renderParameters(z),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        return successResponse(await renderTikz({
          ...objectParams(params),
          projectRoot: projectRoot(ctx),
        }, { signal }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });

  omp.registerTool({
    name: 'tikz_generate_diagram',
    label: 'Generate TikZ Diagram from Layout IR',
    description: 'Accept a diagram IR in ELK JSON format (graph with nodes, edges, ports, and layout options), compute automatic layout via Eclipse Layout Kernel, and generate compilable TikZ source code. The output .tex can be rendered with tikz_render.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Generate a TikZ figure by describing the graph structure and letting ELK compute the layout automatically.',
    promptGuidelines: [
      'Author the diagram as an ELK graph IR: a root with graph-level layoutOptions, a children array of nodes, and an edges array. Each node has id, width, height sized for its exact label plus padding, and optional properties (shape, fill, textColor). Each edge has id, a single sources entry, a single targets entry, and optional properties (arrow, label, color). Size each node to fit its exact label plus padding before calling the layout engine.',
      'Use properties.shape on nodes: rectangle (default), rounded, diamond, ellipse, circle, terminal, parallelogram, cylinder. Use properties.arrow on edges: -> (default), <-, <->, and - for no arrow. Add labels with properties.label; use dashed or dotted for line style. Use - for no arrow and dashed or dotted for line style.',
      'Input nodes must omit x and y and input edges must omit sections and bendPoints; the layout engine computes them. The author never authors, infers, or hand-edits TikZ coordinates; never hand-edit TikZ coordinates and never author TikZ coordinates manually — the ELK graph IR is the sole source of node positions and edge geometry.',
      'Choose elk.algorithm from layered (flows, pipelines, architecture), mrtree (trees), radial (hub or mind-map), stress, or force (general association). Never recommend the fixed or random algorithms for a coordinate-free figure.',
      'Set elk.direction to RIGHT or DOWN. The engine applies generous default spacing (nodeNode, edgeNode, padding, etc.) automatically; do not set spacing options yourself unless you have a specific reason. Set elk.edgeRouting to ORTHOGONAL for layered graphs; stress and force use POLYLINE or SPLINES.',
      'Model groups as parent nodes with children. For edges that cross parent boundaries, use layered with elk.hierarchyHandling set to INCLUDE_CHILDREN; mixed algorithms do not support cross-parent edges.',
      'Place elk.algorithm and every authored layout option in the graph-level layoutOptions; the separate tool layoutOptions parameter is not the reliable algorithm channel. Node sizing, spacing, and compaction are handled by engine defaults; do not author spacing or padding options. Declared node width and height are estimates because the backend ignores ELK label positions and does not emit them as TikZ minimum sizes, so size generously and verify with a render.',
      'Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates. The tool returns the generated TikZ source and the positioned graph metadata; write the returned .tex to the project path and compile it with tikz_render. Export the tool metadata: algorithm used, node count, edge count.',
      'Before generating, confirm the ELK layout engine (elkjs) is installed; if the tool returns ELK_NOT_INSTALLED, install it with `npm run install:deps` (or the `omp_core_install_deps` tool) and call tikz_generate_diagram again. Never fall back to hand-authored TikZ coordinates when ELK is missing: install ELK first, then regenerate from the ELK graph IR.',
      'The tool also returns the positioned ELK graph IR as standard ELK JSON in the `ir` field (and the structured `graph`). Write it to a project-local `<figure>.elk.json` to edit in an ELK-compatible visual editor, then feed the edited IR back as the `graph` input to tikz_generate_diagram to regenerate the TikZ; re-importing recomputes layout via ELK (structural, label, and size edits survive, but node positions are recomputed), so the IR is a round-trip artifact, not a hand-coordinate surface.',
    ],
    parameters: generateParameters(z),
    async execute(_toolCallId, params) {
      try {
        const graph = JSON.parse(params.graph);
        const parsed = { graph };
        if (params.layoutOptions) parsed.layoutOptions = JSON.parse(params.layoutOptions);
        if (params.styleOptions) parsed.tikzOptions = JSON.parse(params.styleOptions);
        return successResponse(await generateTikz(parsed));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });
}
