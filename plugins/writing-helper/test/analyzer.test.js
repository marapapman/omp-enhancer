import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { analyzeWritingLogic } from '../src/analyzer.js';

describe('analyzeWritingLogic', () => {
  it('passes a scoped, evidence-backed Chinese claim', () => {
    const result = analyzeWritingLogic({
      text: '实验在 MNIST 数据集上进行。结果显示，该方法在该数据集上的准确率达到 92%。',
      language: 'zh',
      mode: 'redline',
    });

    assert.equal(result.summary.verdict, 'pass');
    assert.equal(result.issues.length, 0);
  });

  it('flags an unsupported universal Chinese conclusion in redline mode', () => {
    const result = analyzeWritingLogic({
      text: '实验只在 MNIST 数据集上进行。该方法在所有场景下都优于现有方法。',
      language: 'zh',
      mode: 'redline',
    });

    assert.equal(result.summary.verdict, 'needs_revision');
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].dimension, 'evidence');
    assert.equal(result.issues[0].severity, 'WARNING');
  });

  it('flags conflicting numeric values for the same metric', () => {
    const result = analyzeWritingLogic({
      text: '准确率为 91%。随后我们报告准确率为 87%。',
      language: 'zh',
      mode: 'redline',
    });

    assert.equal(result.summary.verdict, 'critical_findings');
    assert.equal(result.issues[0].dimension, 'data');
    assert.equal(result.issues[0].severity, 'FATAL');
  });

  it('flags common terminology drift', () => {
    const result = analyzeWritingLogic({
      text: '本文提出一种检索增强生成方法。后文把同一模块称为 RAG 系统，但没有说明两者关系。',
      language: 'zh',
      mode: 'standard',
    });

    assert.equal(result.summary.verdict, 'needs_revision');
    assert.equal(result.issues.some((issue) => issue.dimension === 'terminology'), true);
  });

  it('does not report pure style preference in redline mode', () => {
    const result = analyzeWritingLogic({
      text: '本文研究这个问题，并给出一个简单方法。',
      language: 'zh',
      mode: 'redline',
    });

    assert.equal(result.summary.verdict, 'pass');
    assert.equal(result.issues.length, 0);
  });

  it('keeps total counts when maxIssues truncates returned issues', () => {
    const result = analyzeWritingLogic({
      text: [
        '准确率为 91%。随后我们报告准确率为 87%。',
        '召回率为 80%。随后我们报告召回率为 70%。',
        'F1 为 66%。随后我们报告 F1 为 60%。',
      ].join('\n'),
      language: 'zh',
      mode: 'redline',
      maxIssues: 2,
    });

    assert.equal(result.summary.total, 3);
    assert.equal(result.issues.length, 2);
  });

  it('uses English paragraph labels for English issues', () => {
    const result = analyzeWritingLogic({
      text: 'Accuracy is 91%. Later, accuracy is 87%.',
      language: 'en',
      mode: 'redline',
    });

    assert.equal(result.summary.verdict, 'critical_findings');
    assert.equal(result.issues[0].location, 'paragraph 1');
  });

  it('uses English whole-document label for English structure issues', () => {
    const result = analyzeWritingLogic({
      text: 'We propose a new method for robust retrieval.',
      language: 'en',
      mode: 'redline',
    });

    assert.equal(result.summary.verdict, 'needs_revision');
    assert.equal(result.issues[0].dimension, 'structure');
    assert.equal(result.issues[0].location, 'whole document');
  });
  it('flags unsupported causal leaps with conclusion markers', () => {
    const result = analyzeWritingLogic({
      text: 'Therefore, this method always solves every case.',
      language: 'en',
      mode: 'standard',
    });

    assert.equal(result.summary.verdict, 'needs_revision');
    assert.equal(result.issues.some((issue) => issue.dimension === 'logic'), true);
  });

  it('matches English markers as words instead of substrings', () => {
    const result = analyzeWritingLogic({
      text: 'A small software system bestowed a label on each sample.',
      language: 'en',
      mode: 'standard',
    });

    assert.equal(result.summary.verdict, 'pass');
  });

});
