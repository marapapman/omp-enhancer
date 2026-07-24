import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWorkflowSummary } from './e2e/workflow-events.mjs';

describe('search assertion evaluator tests', () => {

  it('minSourceSearchCalls enforces lower bound', () => {
    // below minimum → fail
    const missing = evaluateWorkflowSummary(
      { toolCalls: [{ name: 'read', completed: true, isError: false }], sourceSearchCallCount: 1, primaryFinalCount: 0 },
      { minSourceSearchCalls: 2 },
    );
    assert.equal(missing.pass, false);
    assert.match(missing.failures.join('\n'), /source\/search calls 1 were below 2/iu);

    // at minimum → pass
    const enough = evaluateWorkflowSummary(
      { toolCalls: [{ name: 'read' }, { name: 'grep' }], sourceSearchCallCount: 2, primaryFinalCount: 0 },
      { minSourceSearchCalls: 2, requireFinal: false },
    );
    assert.equal(enough.pass, true);

    // zero is fine when min is 0
    const zeroIsFine = evaluateWorkflowSummary(
      { toolCalls: [], sourceSearchCallCount: 0, primaryFinalCount: 1 },
      { minSourceSearchCalls: 0 },
    );
    assert.equal(zeroIsFine.pass, true);

    // no expectation → skip
    const noExpectationIsFine = evaluateWorkflowSummary(
      { toolCalls: [], sourceSearchCallCount: 0, primaryFinalCount: 1 },
      {},
    );
    assert.equal(noExpectationIsFine.pass, true);
  });

  it('requireLocalSearchBeforeProjectTools enforces ordering', () => {
    // search completes before project tool → pass
    const searchBeforeProject = evaluateWorkflowSummary({
      toolCalls: [
        { name: 'read', completed: true, isError: false, completionEventIndex: 2 },
        { name: 'glob', completed: true, isError: false, completionEventIndex: 3 },
      ],
      firstProjectToolCallEventIndex: 5,
    }, { requireLocalSearchBeforeProjectTools: true, requireFinal: false });
    assert.equal(searchBeforeProject.pass, true);

    // search completes after project tool → fail
    const noSearchBeforeProject = evaluateWorkflowSummary({
      toolCalls: [
        { name: 'read', completed: true, isError: false, completionEventIndex: 10 },
      ],
      firstProjectToolCallEventIndex: 5,
    }, { requireLocalSearchBeforeProjectTools: true, requireFinal: false });
    assert.equal(noSearchBeforeProject.pass, false);
    assert.match(noSearchBeforeProject.failures.join('\n'), /no local search tool was called before the first project tool/iu);

    // no project tool at all → fail
    const noProjectToolAtAll = evaluateWorkflowSummary({
      toolCalls: [{ name: 'read', completed: true, isError: false, completionEventIndex: 2 }],
      firstProjectToolCallEventIndex: null,
    }, { requireLocalSearchBeforeProjectTools: true, requireFinal: false });
    assert.equal(noProjectToolAtAll.pass, false);

    // false expectation → skip
    const falseExpectationSkips = evaluateWorkflowSummary({
      toolCalls: [],
    }, { requireLocalSearchBeforeProjectTools: false, requireFinal: false });
    assert.equal(falseExpectationSkips.pass, true);
  });

  it('requireWebSearchBeforeProjectTools enforces ordering', () => {
    // web search completes before project tool → pass
    const webBeforeProject = evaluateWorkflowSummary({
      toolCalls: [
        { name: 'web_search', completed: true, isError: false, completionEventIndex: 2 },
      ],
      firstProjectToolCallEventIndex: 5,
    }, { requireWebSearchBeforeProjectTools: true, requireFinal: false });
    assert.equal(webBeforeProject.pass, true);

    // web search completes after project tool → fail
    const noWebBeforeProject = evaluateWorkflowSummary({
      toolCalls: [
        { name: 'web_search', completed: true, isError: false, completionEventIndex: 10 },
      ],
      firstProjectToolCallEventIndex: 5,
    }, { requireWebSearchBeforeProjectTools: true, requireFinal: false });
    assert.equal(noWebBeforeProject.pass, false);
    assert.match(noWebBeforeProject.failures.join('\n'), /no web search tool was called before the first project tool/iu);

    // false expectation → skip
    const falseExpectationSkips = evaluateWorkflowSummary({
      toolCalls: [],
    }, { requireWebSearchBeforeProjectTools: false, requireFinal: false });
    assert.equal(falseExpectationSkips.pass, true);
  });
});
