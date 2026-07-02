import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { analyzeWritingQuality } from '../src/quality.js';

describe('analyzeWritingQuality', () => {
  it('reports Chinese style issues without treating them as logic failures', () => {
    const result = analyzeWritingQuality({
      text: '近年来，随着人工智能技术的快速发展，本文将从以下几个方面展开。该方法具有重要意义——未来仍需进一步探索。',
      language: 'zh',
      checks: ['style'],
    });

    assert.equal(result.language, 'zh');
    assert.equal(result.summary.byCategory.style > 0, true);
    assert.equal(result.issues.some((issue) => issue.category === 'style' && issue.pattern === 'zh-empty-opener'), true);
    assert.equal(result.issues.some((issue) => issue.pattern === 'zh-em-dash'), true);
    assert.equal(result.issues.every((issue) => issue.category === 'style'), true);
  });

  it('reports English AI-style patterns', () => {
    const result = analyzeWritingQuality({
      text: 'In today\'s rapidly evolving landscape, this paper delves into a pivotal solution. Moreover, it is worth noting that the future looks bright.',
      language: 'en',
      checks: ['style'],
    });

    assert.equal(result.language, 'en');
    assert.equal(result.issues.some((issue) => issue.pattern === 'en-formulaic-introduction'), true);
    assert.equal(result.issues.some((issue) => issue.pattern === 'en-generic-hedging'), true);
  });

  it('combines existing logic checks with style and citation checks', () => {
    const result = analyzeWritingQuality({
      text: '准确率为 91%。随后准确率为 87%。近年来，随着人工智能技术的快速发展。参考文献 [@missing].',
      language: 'zh',
      checks: ['logic', 'style', 'citation'],
      bibliography: '',
    });

    assert.equal(result.summary.byCategory.logic > 0, true);
    assert.equal(result.summary.byCategory.style > 0, true);
    assert.equal(result.summary.byCategory.citation > 0, true);
    assert.equal(result.summary.verdict, 'blocked');
  });
});
