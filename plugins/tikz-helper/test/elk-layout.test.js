import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { computeLayout, createElk, checkElkEnvironment, ELK_INSTALL_GUIDANCE } from '../src/elk-layout.js';
import { generateTikz } from '../src/generate-tikz.js';

describe('elk-layout: input validation', () => {
  it('rejects null or non-object graph', async () => {
    await assert.rejects(
      () => computeLayout(null),
      (error) => error.code === 'INVALID_GRAPH_IR'
        && error.message.includes('non-null object'),
    );
    await assert.rejects(
      () => computeLayout('string'),
      (error) => error.code === 'INVALID_GRAPH_IR',
    );
  });

  it('rejects graph without id', async () => {
    await assert.rejects(
      () => computeLayout({ children: [{ id: 'a', width: 10, height: 10 }] }),
      (error) => error.code === 'INVALID_GRAPH_IR'
        && error.message.includes('non-empty string id'),
    );
  });

  it('rejects graph without children', async () => {
    await assert.rejects(
      () => computeLayout({ id: 'root', children: [] }),
      (error) => error.code === 'INVALID_GRAPH_IR'
        && error.message.includes('at least one child'),
    );
  });

  it('rejects nodes without valid width or height', async () => {
    await assert.rejects(
      () => computeLayout({ id: 'root', children: [{ id: 'n1', width: 0, height: 10 }] }),
      (error) => error.code === 'INVALID_GRAPH_IR' && error.message.includes('width'),
    );
    await assert.rejects(
      () => computeLayout({ id: 'root', children: [{ id: 'n1', width: 10, height: -1 }] }),
      (error) => error.code === 'INVALID_GRAPH_IR' && error.message.includes('height'),
    );
  });

  it('rejects edges without sources or targets', async () => {
    await assert.rejects(
      () => computeLayout({ id: 'root', children: [{ id: 'n1', width: 10, height: 10 }], edges: [{ id: 'e1', sources: [], targets: ['n1'] }] }),
      (error) => error.code === 'INVALID_GRAPH_IR' && error.message.includes('source'),
    );
  });

  it('rejects unknown layout algorithm', async () => {
    await assert.rejects(
      () => computeLayout({ id: 'root', layoutOptions: { 'elk.algorithm': 'magic' }, children: [{ id: 'n1', width: 10, height: 10 }] }),
      (error) => error.code === 'INVALID_GRAPH_IR' && error.message.includes('magic'),
    );
  });
});

describe('elk-layout: computeLayout integration', () => {
  it('computes layout for a simple 2-node graph with default layered algorithm', async () => {
    const graph = {
      id: 'simple',
      children: [
        { id: 'n1', width: 30, height: 20 },
        { id: 'n2', width: 30, height: 20 },
      ],
      edges: [
        { id: 'e1', sources: ['n1'], targets: ['n2'] },
      ],
    };

    const result = await computeLayout(graph);

    assert.ok(result.graph, 'result.graph exists');
    assert.ok(Array.isArray(result.graph.children), 'result.graph.children is array');
    assert.equal(result.graph.children.length, 2);
    assert.equal(result.metadata.algorithm, 'layered');
    assert.equal(result.metadata.nodeCount, 2);
    assert.equal(result.metadata.edgeCount, 1);

    // Nodes should have x/y positions after layout
    for (const node of result.graph.children) {
      assert.equal(typeof node.x, 'number', `Node ${node.id} has x`);
      assert.equal(typeof node.y, 'number', `Node ${node.id} has y`);
      assert.ok(node.x >= 0, `Node ${node.id} x is non-negative`);
      assert.ok(node.y >= 0, `Node ${node.id} y is non-negative`);
    }

    // Edges should have sections with routing
    assert.ok(Array.isArray(result.graph.edges));
    assert.ok(result.graph.edges.length > 0);
    const edge = result.graph.edges[0];
    assert.ok(Array.isArray(edge.sections), 'Edge has sections');
    assert.ok(edge.sections.length > 0, 'Edge has at least one section');
    assert.ok(edge.sections[0].startPoint, 'Section has startPoint');
    assert.ok(edge.sections[0].endPoint, 'Section has endPoint');
  });

  it('uses specified layout algorithm', async () => {
    const graph = {
      id: 'stress',
      layoutOptions: { 'elk.algorithm': 'stress' },
      children: [
        { id: 'n1', width: 30, height: 20 },
        { id: 'n2', width: 30, height: 20 },
      ],
      edges: [
        { id: 'e1', sources: ['n1'], targets: ['n2'] },
      ],
    };

    const result = await computeLayout(graph);
    assert.equal(result.metadata.algorithm, 'stress');
  });

  it('reports execution time', async () => {
    const graph = {
      id: 'time-test',
      children: [
        { id: 'n1', width: 30, height: 20 },
        { id: 'n2', width: 30, height: 20 },
        { id: 'n3', width: 30, height: 20 },
      ],
      edges: [
        { id: 'e1', sources: ['n1'], targets: ['n2'] },
        { id: 'e2', sources: ['n1'], targets: ['n3'] },
      ],
    };

    const result = await computeLayout(graph);
    assert.equal(typeof result.metadata.executionTime, 'number');
    assert.ok(result.metadata.executionTime >= 0);
  });
});

describe('elk-layout: factory', () => {
  it('creates a valid options object', () => {
    const instance = createElk({ defaultLayoutOptions: { 'elk.spacing.nodeNode': '50' } });
    assert.deepEqual(instance.options.defaultLayoutOptions, { 'elk.spacing.nodeNode': '50' });
  });
});

describe('elk-layout: ELK environment check', () => {
  const graph = {
    id: 'g',
    children: [
      { id: 'a', width: 40, height: 20 },
      { id: 'b', width: 40, height: 20 },
    ],
    edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
  };
  const fail = async () => { throw new Error("Cannot find package 'elkjs'"); };

  it('reports ELK_AVAILABLE when elkjs can be imported', async () => {
    const r = await checkElkEnvironment();
    assert.equal(r.available, true);
    assert.equal(r.code, 'ELK_AVAILABLE');
  });

  it('reports ELK_NOT_INSTALLED with install guidance when the importer fails', async () => {
    const r = await checkElkEnvironment({ importElk: fail });
    assert.equal(r.available, false);
    assert.equal(r.code, 'ELK_NOT_INSTALLED');
    assert.equal(r.install.command, 'npm run install:deps');
    assert.equal(r.install.tool, 'omp_core_install_deps');
    assert.match(r.directive, /Never fall back to hand-authored TikZ coordinates/);
    assert.ok(typeof r.error === 'string');
  });

  it('exposes a frozen ELK_INSTALL_GUIDANCE with the install seam', () => {
    assert.equal(ELK_INSTALL_GUIDANCE.code, 'ELK_NOT_INSTALLED');
    assert.equal(ELK_INSTALL_GUIDANCE.install.command, 'npm run install:deps');
    assert.equal(ELK_INSTALL_GUIDANCE.install.tool, 'omp_core_install_deps');
    assert.equal(ELK_INSTALL_GUIDANCE.install.package, 'elkjs');
    assert.match(ELK_INSTALL_GUIDANCE.directive, /Never fall back to hand-authored TikZ coordinates/);
    assert.ok(Object.isFrozen(ELK_INSTALL_GUIDANCE));
    assert.ok(Object.isFrozen(ELK_INSTALL_GUIDANCE.install));
  });

  it('computeLayout rejects with ELK_NOT_INSTALLED guidance when elkjs is missing', async () => {
    await assert.rejects(
      () => computeLayout(graph, { importElk: fail }),
      (e) => e.code === 'ELK_NOT_INSTALLED'
        && e.details.install.command === 'npm run install:deps'
        && /Never fall back to hand-authored TikZ coordinates/.test(e.message),
    );
  });

  it('generateTikz rejects with ELK_NOT_INSTALLED when elkjs is missing', async () => {
    await assert.rejects(
      () => generateTikz({ graph }, { importElk: fail }),
      (e) => e.code === 'ELK_NOT_INSTALLED',
    );
  });
});
