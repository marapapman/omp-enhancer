import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { analyzeWritingQuality, normalizeSectionOrdering, groupIssuesBySection } from '../src/quality.js';

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
});

describe('normalizeSectionOrdering', () => {
  it('returns the input unchanged for non-object or nullish input', () => {
    assert.equal(normalizeSectionOrdering(null), null);
    assert.equal(normalizeSectionOrdering(undefined), undefined);
    assert.equal(normalizeSectionOrdering('string'), 'string');
    assert.equal(normalizeSectionOrdering(42), 42);
  });

  it('returns the input unchanged when issues is missing or not an array', () => {
    const noIssues = { ok: true };
    assert.equal(normalizeSectionOrdering(noIssues), noIssues);

    const nullIssues = { ok: true, issues: null };
    assert.equal(normalizeSectionOrdering(nullIssues), nullIssues);
  });

  it('does not mutate the original result or issues array', () => {
    const original = {
      ok: true,
      issues: [
        { category: 'style', severity: 'WARNING' },
        { category: 'style', severity: 'FATAL' },
      ],
    };
    const result = normalizeSectionOrdering(original);
    assert.notEqual(result, original);
    assert.notEqual(result.issues, original.issues, 'should produce a new array');
    assert.equal(original.issues[0].severity, 'WARNING', 'original should not be mutated');
  });

  it('keeps an empty issues array unchanged', () => {
    const result = normalizeSectionOrdering({ ok: true, issues: [] });
    assert.deepEqual(result.issues, []);
  });

  it('preserves existing order when issues are already canonical', () => {
    const issues = [
      { category: 'logic', severity: 'FATAL' },
      { category: 'logic', severity: 'WARNING' },
      { category: 'style', severity: 'FATAL' },
      { category: 'citation', severity: 'CRITICAL' },
      { category: 'preservation', severity: 'IMPORTANT' },
    ];
    const result = normalizeSectionOrdering({ ok: true, issues });
    assert.equal(result.issues[0].category, 'logic');
    assert.equal(result.issues[0].severity, 'FATAL');
    assert.equal(result.issues[1].severity, 'WARNING');
    assert.equal(result.issues[2].category, 'style');
    assert.equal(result.issues[3].category, 'citation');
    assert.equal(result.issues[4].category, 'preservation');
  });

  it('sorts reverse-category issues into canonical order', () => {
    const issues = [
      { category: 'preservation', severity: 'INFO' },
      { category: 'citation', severity: 'WARNING' },
      { category: 'style', severity: 'CRITICAL' },
      { category: 'logic', severity: 'FATAL' },
    ];
    const result = normalizeSectionOrdering({ ok: true, issues });
    assert.equal(result.issues[0].category, 'logic');
    assert.equal(result.issues[1].category, 'style');
    assert.equal(result.issues[2].category, 'citation');
    assert.equal(result.issues[3].category, 'preservation');
  });

  it('sorts by severity within the same category', () => {
    const issues = [
      { category: 'style', severity: 'WARNING' },
      { category: 'style', severity: 'FATAL' },
      { category: 'style', severity: 'CRITICAL' },
      { category: 'style', severity: 'IMPORTANT' },
    ];
    const result = normalizeSectionOrdering({ ok: true, issues });
    assert.equal(result.issues[0].severity, 'FATAL');
    assert.equal(result.issues[1].severity, 'CRITICAL');
    assert.equal(result.issues[2].severity, 'WARNING');
    assert.equal(result.issues[3].severity, 'IMPORTANT');
  });

  it('sorts unknown categories after known ones', () => {
    const issues = [
      { category: 'unknown', severity: 'FATAL' },
      { category: 'logic', severity: 'INFO' },
    ];
    const result = normalizeSectionOrdering({ ok: true, issues });
    assert.equal(result.issues[0].category, 'logic');
    assert.equal(result.issues[1].category, 'unknown');
  });

  it('sorts unknown severities after known ones', () => {
    const issues = [
      { category: 'logic', severity: 'UNKNOWN' },
      { category: 'logic', severity: 'FATAL' },
    ];
    const result = normalizeSectionOrdering({ ok: true, issues });
    assert.equal(result.issues[0].severity, 'FATAL');
    assert.equal(result.issues[1].severity, 'UNKNOWN');
  });

  it('preserves other top-level fields on the result', () => {
    const result = normalizeSectionOrdering({
      ok: true,
      language: 'zh',
      mode: 'redline',
      checks: ['logic', 'style'],
      summary: { total: 2, returned: 2 },
      issues: [
        { category: 'style', severity: 'WARNING' },
        { category: 'logic', severity: 'FATAL' },
      ],
      citations: [],
      preservation: { compared: false },
    });
    assert.equal(result.language, 'zh');
    assert.equal(result.mode, 'redline');
    assert.deepEqual(result.checks, ['logic', 'style']);
    assert.equal(result.issues[0].category, 'logic');
    assert.equal(result.issues[1].category, 'style');
  });

  it('handles edge-case issue values without throwing', () => {
    const issues = [
      { severity: 'FATAL' },
      { category: 'style' },
      {},
      null,
      42,
    ];
    const result = normalizeSectionOrdering({ ok: true, issues });
    assert.equal(Array.isArray(result.issues), true);
    assert.equal(result.issues.length, 5);
  });

  it('orders issues from a real analyzeWritingQuality result canonically', () => {
    const raw = analyzeWritingQuality({
      text: '准确率为 91%。随后准确率为 87%。近年来，随着人工智能技术的快速发展。参考文献 [@missing].',
      language: 'zh',
      checks: ['logic', 'style', 'citation'],
      bibliography: '',
    });
    const ordered = normalizeSectionOrdering(raw);
    const seen = [];
    for (const issue of ordered.issues) {
      if (seen.length === 0 || seen[seen.length - 1] !== issue.category) {
        seen.push(issue.category);
      }
    }
    assert.deepEqual(seen, ['logic', 'style', 'citation'],
      'issues should be grouped in canonical category order');
    assert.equal(ordered.language, 'zh');
    assert.equal(ordered.summary.total, raw.summary.total);
  });
});

describe('groupIssuesBySection', () => {
  it('returns an empty array for non-array input', () => {
    assert.deepEqual(groupIssuesBySection(null), []);
    assert.deepEqual(groupIssuesBySection(undefined), []);
    assert.deepEqual(groupIssuesBySection('string'), []);
    assert.deepEqual(groupIssuesBySection(42), []);
  });

  it('returns an empty array for an empty array', () => {
    assert.deepEqual(groupIssuesBySection([]), []);
  });

  it('groups issues by category into canonical section order', () => {
    const issues = [
      { category: 'preservation', severity: 'FATAL' },
      { category: 'style', severity: 'CRITICAL' },
      { category: 'citation', severity: 'WARNING' },
      { category: 'logic', severity: 'IMPORTANT' },
    ];
    const sections = groupIssuesBySection(issues);
    assert.equal(sections.length, 4);
    assert.equal(sections[0].category, 'logic');
    assert.equal(sections[1].category, 'style');
    assert.equal(sections[2].category, 'citation');
    assert.equal(sections[3].category, 'preservation');
  });

  it('sorts issues by severity within each section', () => {
    const issues = [
      { category: 'logic', severity: 'IMPORTANT' },
      { category: 'logic', severity: 'FATAL' },
      { category: 'logic', severity: 'CRITICAL' },
    ];
    const sections = groupIssuesBySection(issues);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].issues[0].severity, 'FATAL');
    assert.equal(sections[0].issues[1].severity, 'CRITICAL');
    assert.equal(sections[0].issues[2].severity, 'IMPORTANT');
  });

  it('places unknown categories after known ones', () => {
    const issues = [
      { category: 'unknown', severity: 'FATAL' },
      { category: 'logic', severity: 'INFO' },
      { category: '', severity: 'WARNING' },
    ];
    const sections = groupIssuesBySection(issues);
    assert.equal(sections[0].category, 'logic');
    assert.equal(sections[1].category, 'unknown');
    assert.equal(sections[2].category, '');
  });

  it('groups multiple issues into the same section', () => {
    const issues = [
      { category: 'style', severity: 'FATAL' },
      { category: 'logic', severity: 'FATAL' },
      { category: 'style', severity: 'WARNING' },
    ];
    const sections = groupIssuesBySection(issues);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].category, 'logic');
    assert.equal(sections[0].issues.length, 1);
    assert.equal(sections[1].category, 'style');
    assert.equal(sections[1].issues.length, 2);
    assert.equal(sections[1].issues[0].severity, 'FATAL');
    assert.equal(sections[1].issues[1].severity, 'WARNING');
  });

  it('handles issues with missing category or severity', () => {
    const issues = [
      { severity: 'FATAL' },
      { category: 'logic' },
      {},
      null,
      42,
      { category: 'style', severity: 'CRITICAL' },
    ];
    const sections = groupIssuesBySection(issues);
    const cats = sections.map((s) => s.category);
    // logic before unknown, style before unknown
    assert.equal(cats.indexOf('logic') < cats.indexOf('__unknown__'), true);
    assert.equal(cats.indexOf('style') < cats.indexOf('__unknown__'), true);
    // null/42 grouped into __unknown__
    const unknown = sections.find((s) => s.category === '__unknown__');
    assert.equal(unknown, sections[sections.length - 1], 'unknown section should be last');
  });

  it('uses severity ordering for mixed known and unknown severities', () => {
    const issues = [
      { category: 'style', severity: 'UNKNOWN' },
      { category: 'style', severity: 'FATAL' },
    ];
    const sections = groupIssuesBySection(issues);
    assert.equal(sections[0].category, 'style');
    assert.equal(sections[0].issues.length, 2);
    assert.equal(sections[0].issues[0].severity, 'FATAL');
    assert.equal(sections[0].issues[1].severity, 'UNKNOWN');
  });

  it('produces section output from a real analyzeWritingQuality result', () => {
    const raw = analyzeWritingQuality({
      text: '准确率为 91%。随后准确率为 87%。近年来，随着人工智能技术的快速发展。参考文献 [@missing].',
      language: 'zh',
      checks: ['logic', 'style', 'citation'],
      bibliography: '',
    });
    const sections = groupIssuesBySection(raw.issues);
    const catOrder = sections.map((s) => s.category);
    assert.deepEqual(catOrder, ['logic', 'style', 'citation'],
      'sections should be in canonical order');
    for (const section of sections) {
      assert.equal(Array.isArray(section.issues), true);
      assert.ok(section.issues.length > 0, `section ${section.category} should have issues`);
    }
  });
});
