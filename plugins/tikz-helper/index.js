import { prepareAsset } from './src/asset-prepare.js';
import { searchCatalog } from './src/catalog-search.js';
import { renderTikz } from './src/render-tikz.js';
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

export { prepareAsset } from './src/asset-prepare.js';
export { searchCatalog } from './src/catalog-search.js';
export { renderTikz, runBoundedCommand } from './src/render-tikz.js';

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
}
