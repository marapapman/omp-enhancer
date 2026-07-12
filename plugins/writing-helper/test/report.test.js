import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { formatWritingLogicReport, formatWritingQualityReport } from '../src/report.js';

function result(overrides) {
  return {
    ok: true,
    language: 'zh',
    mode: 'redline',
    summary: {
      total: 0,
      fatalOrCritical: 0,
      warningsOrImportant: 0,
      minor: 0,
      verdict: 'pass',
    },
    issues: [],
    ...overrides,
  };
}

describe('formatWritingLogicReport', () => {
  it('formats the exact Chinese pass message', () => {
    assert.equal(formatWritingLogicReport(result({ language: 'zh' })), '[检测通过，无实质性逻辑问题]');
  });

  it('formats the exact English pass message', () => {
    assert.equal(formatWritingLogicReport(result({ language: 'en' })), '[Passed: no substantive logic issues found]');
  });

  it('includes issue fields in Chinese reports without em dash', () => {
    const report = formatWritingLogicReport(
      result({
        language: 'zh',
        summary: {
          total: 1,
          fatalOrCritical: 1,
          warningsOrImportant: 0,
          minor: 0,
          verdict: 'critical_findings',
        },
        issues: [
          {
            id: 'data-1',
            severity: 'FATAL',
            dimension: 'data',
            location: '第 1 段',
            quote: '准确率为 91%；准确率为 87%',
            problem: '同一指标出现了不一致的数值。',
            suggestion: '核对实验记录，统一该指标的数值。',
          },
        ],
      }),
    );

    assert.match(report, /## 逻辑检查结果/);
    assert.match(report, /### 问题 1：data FATAL/);
    assert.match(report, /位置：第 1 段/);
    assert.match(report, /原文：「准确率为 91%；准确率为 87%」/);
    assert.equal(report.includes('—'), false);
    assert.equal(report.includes('——'), false);
  });

  it('mentions omitted issues when total exceeds returned issues', () => {
    const report = formatWritingLogicReport(
      result({
        language: 'en',
        summary: {
          total: 3,
          fatalOrCritical: 0,
          warningsOrImportant: 3,
          minor: 0,
          verdict: 'needs_revision',
        },
        issues: [
          {
            id: 'logic-1',
            severity: 'IMPORTANT',
            dimension: 'logic',
            location: 'paragraph 1',
            quote: 'Therefore it always works.',
            problem: 'Unsupported strong conclusion.',
            suggestion: 'Narrow the conclusion.',
          },
        ],
      }),
    );

    assert.match(report, /2 additional issue\(s\) omitted/);
  });

});

describe('formatWritingQualityReport', () => {
  it('formats exact pass messages in both languages', () => {
    assert.equal(
      formatWritingQualityReport(result({ language: 'zh' })),
      '[检测通过，无写作质量问题]',
    );
    assert.equal(
      formatWritingQualityReport(result({ language: 'en' })),
      '[Passed: no writing quality issues found]',
    );
  });

  it('formats Chinese quality issues and omitted counts', () => {
    const report = formatWritingQualityReport(
      result({
        language: 'zh',
        summary: {
          total: 2,
          byCategory: { logic: 1, style: 1, citation: 0 },
          fatalOrCritical: 0,
          warningsOrImportant: 2,
          minor: 0,
          verdict: 'needs_revision',
        },
        issues: [
          {
            id: 'style-1',
            severity: 'WARNING',
            dimension: 'style',
            location: '第 1 段',
            quote: '近年来，随着技术发展。',
            problem: '空泛开头。',
            suggestion: '直接进入论点。',
          },
        ],
      }),
    );

    assert.match(report, /## 写作质量检查结果/);
    assert.match(report, /摘要：逻辑 1，风格 1，引用 0。/);
    assert.match(report, /另有 1 个问题未显示。/);
  });

  it('formats English quality issues with default category counts', () => {
    const report = formatWritingQualityReport(
      result({
        language: 'en',
        summary: {
          total: 1,
          fatalOrCritical: 0,
          warningsOrImportant: 1,
          minor: 0,
          verdict: 'needs_revision',
        },
        issues: [
          {
            id: 'style-1',
            severity: 'IMPORTANT',
            dimension: 'style',
            location: 'paragraph 1',
            quote: "In today's rapidly evolving landscape.",
            problem: 'Formulaic introduction.',
            suggestion: 'Start with the concrete claim.',
          },
        ],
      }),
    );

    assert.match(report, /## Writing Quality Check Results/);
    assert.match(report, /Summary: logic 0, style 0, citation 0\./);
    assert.match(report, /Issue 1: style IMPORTANT/);
  });
});
