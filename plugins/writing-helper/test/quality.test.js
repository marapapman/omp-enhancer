import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { analyzeWritingQuality } from '../src/quality.js';

describe('analyzeWritingQuality', () => {
  it('reports Chinese style issues in standard mode without treating them as logic failures', () => {
    const result = analyzeWritingQuality({
      text: '近年来，随着人工智能技术的快速发展，本文将从以下几个方面展开。该方法具有重要意义——未来仍需进一步探索。',
      language: 'zh',
      checks: ['style'],
      mode: 'standard',
    });

    assert.equal(result.language, 'zh');
    assert.equal(result.mode, 'standard');
    assert.equal(result.summary.byCategory.style > 0, true);
    assert.equal(result.issues.some((issue) => issue.category === 'style' && issue.pattern === 'zh-empty-opener'), true);
    assert.equal(result.issues.some((issue) => issue.pattern === 'zh-em-dash'), true);
    assert.equal(result.issues.every((issue) => issue.category === 'style'), true);
  });

  it('drops MINOR style findings in redline mode but keeps IMPORTANT ones', () => {
    const result = analyzeWritingQuality({
      text: '近年来，随着人工智能技术的快速发展，本文将从以下几个方面展开。该方法具有重要意义——未来仍需进一步探索。',
      language: 'zh',
      checks: ['style'],
      mode: 'redline',
    });

    assert.equal(result.mode, 'redline');
    assert.equal(result.issues.some((issue) => issue.pattern === 'zh-em-dash'), true);
    assert.equal(result.issues.some((issue) => issue.pattern === 'zh-empty-opener'), false);
    assert.equal(result.issues.every((issue) => issue.severity !== 'MINOR'), true);
  });

  it('reports English AI-style patterns', () => {
    const result = analyzeWritingQuality({
      text: 'In today\'s rapidly evolving landscape, this paper delves into a pivotal solution. Moreover, it is worth noting that the future looks bright.',
      language: 'en',
      checks: ['style'],
      mode: 'standard',
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
      mode: 'standard',
    });

    assert.equal(result.summary.byCategory.logic > 0, true);
    assert.equal(result.summary.byCategory.style > 0, true);
    assert.equal(result.summary.byCategory.citation > 0, true);
    assert.equal(result.summary.verdict, 'critical_findings');
  });

  it('adds semantic preservation findings only when explicitly requested', () => {
    const result = analyzeWritingQuality({
      originalText: 'The method typically may improve accuracy by 12.5%.',
      text: 'The method improves accuracy by 14%.',
      language: 'en',
      checks: ['preservation'],
      preservation: true,
    });

    assert.deepEqual(result.checks, ['preservation']);
    assert.equal(result.preservation.compared, true);
    assert.equal(result.preservation.driftDetected, true);
    assert.equal(result.summary.byCategory.preservation > 0, true);
    assert.equal(result.summary.verdict, 'needs_revision');
  });

  it('supports the preservation flag and reports an unavailable comparison without original text', () => {
    const preserved = analyzeWritingQuality({
      originalText: '通常可能提升 12%。',
      text: '通常可能提升 12%。',
      language: 'zh',
      checks: ['style'],
      preservation: true,
    });
    assert.deepEqual(preserved.checks, ['style', 'preservation']);
    assert.equal(preserved.preservation.driftDetected, false);

    const missingOriginal = analyzeWritingQuality({
      text: 'Revised text.',
      checks: ['preservation'],
    });
    assert.equal(missingOriginal.preservation.compared, false);
    assert.match(missingOriginal.preservation.reason, /originalText/);
    assert.equal(missingOriginal.summary.byCategory.preservation, 1);
    assert.equal(missingOriginal.summary.verdict, 'needs_revision');

    const missingChineseOriginal = analyzeWritingQuality({
      text: '修订稿。',
      language: 'zh',
      checks: ['preservation'],
    });
    assert.match(missingChineseOriginal.issues[0].problem, /缺少原文/);
    assert.match(missingChineseOriginal.issues[0].suggestion, /提供 originalText/);
  });

  it('rejects unsupported checks instead of returning a false pass', () => {
    assert.throws(
      () => analyzeWritingQuality({ text: 'Plain text.', checks: ['unknown'] }),
      /Unsupported writing checks: unknown/,
    );
    assert.throws(
      () => analyzeWritingQuality({ text: 'Plain text.', checks: ['logic', 'unknown'] }),
      /Unsupported writing checks: unknown/,
    );
    assert.deepEqual(analyzeWritingQuality({ text: 'Plain text.', checks: [] }).checks, [
      'logic',
      'style',
      'citation',
    ]);
  });

  it('applies the quality default of 30 to the aggregate issue list', () => {
    const text = Array.from({ length: 200 }, (_, i) => `该方法必然优于基线方法 ${i}。`).join('\n');
    const result = analyzeWritingQuality({ text, language: 'zh', checks: ['logic'] });

    assert.equal(result.summary.total, 200);
    assert.equal(result.summary.returned, 30);
    assert.equal(result.issues.length, 30);
  });

  it('clamps aggregate maxIssues to the quality cap of 150 and minimum of 1', () => {
    const text = Array.from({ length: 200 }, (_, i) => `该方法必然优于基线方法 ${i}。`).join('\n');

    const capped = analyzeWritingQuality({ text, language: 'zh', checks: ['logic'], maxIssues: 1000 });
    assert.equal(capped.summary.total, 200);
    assert.equal(capped.issues.length, 150);

    const clampedLow = analyzeWritingQuality({ text, language: 'zh', checks: ['logic'], maxIssues: 0 });
    assert.equal(clampedLow.issues.length, 1);
  });
});
