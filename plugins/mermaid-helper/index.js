import { renderMermaid } from './src/mermaid-render.js';
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

function mermaidParameters(z) {
  return z.object({
    sourcePath: optional(z, z.string()).describe('Path to the Mermaid .mmd or .md source file to render. Provide exactly one of source or sourcePath.'),
    source: optional(z, z.string()).describe('Inline Mermaid source text. Provide exactly one of source or sourcePath.'),
    outputDirectory: optional(z, z.string()).describe('Directory for output files. Defaults to figures/mermaid/rendered.'),
    theme: optional(z, z.enum(['default', 'forest', 'dark', 'neutral'])).describe('Mermaid theme. Defaults to default.'),
    width: optional(z, z.number()).describe('Optional output width in pixels for the rendered SVG.'),
    timeoutMs: optional(z, z.number()).describe('Timeout in milliseconds for the render process.'),
  });
}

export { renderMermaid } from './src/mermaid-render.js';

export default function registerMermaidHelper(omp) {
  const z = omp.zod.z;
  omp.setLabel?.('Mermaid Helper');

  omp.registerTool({
    name: 'mermaid_render',
    label: 'Render Mermaid Diagram',
    description: 'Validate Mermaid source (inline or project .mmd/.md) and run the pinned mermaid-cli in an isolated temporary workspace with offline, sandboxed headless Chrome, then publish revision-bound SVG evidence. Never hand-edit SVG coordinates.',
    approval: 'exec',
    promptSnippet: 'Convert authored Mermaid code to revision-bound SVG evidence.',
    promptGuidelines: [
      'Author the diagram in Mermaid code first; never hand-edit SVG coordinates.',
      'This tool accepts no command or executable parameter; rendering is fully offline with sandbox launch flags.',
      'The structured evidence reports execution facts only and does not decide completion.',
    ],
    parameters: mermaidParameters(z),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        return successResponse(await renderMermaid({
          ...objectParams(params),
          projectRoot: projectRoot(ctx),
        }, { signal }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });
}
