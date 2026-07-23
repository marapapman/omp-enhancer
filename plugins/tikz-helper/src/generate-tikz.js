import { computeLayout } from './elk-layout.js';
import { elkToTikz } from './tikz-backend.js';
import { TikzRuntimeError } from './runtime-error.js';

function validateProperties(graph) {
  if (!graph || typeof graph !== 'object') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must be a non-null object.');
  }
  if (typeof graph.id !== 'string' || graph.id.trim() === '') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must have a non-empty string id.');
  }
  if (!Array.isArray(graph.children) || graph.children.length === 0) {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must have at least one child node.');
  }
}

export async function generateTikz(input = {}, options = {}) {
  const graph = input.graph;
  const tikzOptions = input.tikzOptions ?? {};
  const layoutOptions = input.layoutOptions ?? {};

  validateProperties(graph);

  // Step 1: Compute layout via elkjs
  const layoutResult = await computeLayout(graph, { layoutOptions });

  // Step 2: Generate TikZ from positioned graph
  const tikzSource = elkToTikz(layoutResult.graph, {
    standalone: tikzOptions.standalone,
    yAxisFlip: tikzOptions.yAxisFlip,
    defaultShape: tikzOptions.defaultShape,
    defaultArrow: tikzOptions.defaultArrow,
    tikzLibraries: tikzOptions.tikzLibraries,
    preamble: tikzOptions.preamble,
  });

  return {
    ok: true,
    tikz: tikzSource,
    graph: layoutResult.graph,
    metadata: {
      ...layoutResult.metadata,
    },
  };
}

export { computeLayout, elkToTikz };
