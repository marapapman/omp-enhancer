import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { paragraphLocation, resolveLanguage } from '../src/language.js';

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

describe('paragraphLocation', () => {
  it('numbers paragraphs 1-based and counts blank-line separators', () => {
    assert.equal(paragraphLocation('first paragraph\n\nsecond paragraph', 17, 'en'), 'paragraph 2');
    assert.equal(paragraphLocation('第一段\n\n第二段', 6, 'zh'), '第 2 段');
  });

  it('defaults to English labels for non-Chinese languages', () => {
    assert.equal(paragraphLocation('plain text', 4, 'auto'), 'paragraph 1');
  });

  it('treats a negative index as the document start', () => {
    assert.equal(paragraphLocation('some text', -3, 'en'), 'paragraph 1');
  });
});
