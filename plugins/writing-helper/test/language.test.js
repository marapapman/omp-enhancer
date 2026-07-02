import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { resolveLanguage } from '../src/language.js';

describe('resolveLanguage', () => {
  it('uses explicit Chinese without inspecting text', () => {
    assert.equal(resolveLanguage('zh', 'plain English text'), 'zh');
  });

  it('uses explicit English without inspecting text', () => {
    assert.equal(resolveLanguage('en', '这是一段中文文本'), 'en');
  });

  it('detects Chinese when CJK characters dominate', () => {
    assert.equal(resolveLanguage('auto', '这个方法在三个数据集上表现稳定。'), 'zh');
  });

  it('detects English when Latin characters dominate', () => {
    assert.equal(resolveLanguage('auto', 'The method is stable across three datasets.'), 'en');
  });

  it('chooses Chinese for mixed text with dominant CJK characters', () => {
    assert.equal(resolveLanguage('auto', '该方法使用 BERT 做分类，并报告 F1。'), 'zh');
  });

  it('defaults ambiguous empty text to English', () => {
    assert.equal(resolveLanguage('auto', '   \n\t'), 'en');
  });
});
