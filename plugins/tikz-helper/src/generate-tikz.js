import { computeLayout } from './elk-layout.js';
import { elkToTikz } from './tikz-backend.js';

export async function generateTikz(input = {}, options = {}) {
  const graph = input.graph;
  const tikzOptions = input.tikzOptions ?? {};
  const layoutOptions = input.layoutOptions ?? {};

  // Step 1: Compute layout via elkjs
  const layoutResult = await computeLayout(graph, { layoutOptions, importElk: options.importElk });

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
    ir: JSON.stringify(layoutResult.graph, null, 2),
    graph: layoutResult.graph,
    metadata: {
      ...layoutResult.metadata,
    },
  };
}

export { computeLayout, elkToTikz };
