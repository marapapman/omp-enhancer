import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocumentPreservationBaseline,
  evaluateDocumentPreservation,
  requiresDocumentPreservation,
} from '../src/document-preservation.js';

const TARGET = 'docs/notes.md';
const ORIGINAL = '# Notes\n\nThe stable fact is 42.\n';

function baseline(text = ORIGINAL, targetPath = TARGET) {
  return createDocumentPreservationBaseline({ oldText: text, targetPath });
}

function evaluate(newText, oldBaseline = baseline(), targetPath = TARGET) {
  return evaluateDocumentPreservation({ baseline: oldBaseline, newText, targetPath });
}

test('explicit bilingual preservation constraints are detected without routing ordinary polish', () => {
  for (const prompt of [
    '润色 docs/notes.md，但保持事实 42 不变。',
    '润色 docs/notes.md，事实不变。',
    '润色 docs/notes.md，只改表达，不动事实。',
    '只润色 docs/notes.md，不改事实和数字。',
    '请改写这段话，不要改变事实和数字。',
    'Polish docs/notes.md while keeping the facts unchanged.',
    'Polish docs/notes.md; facts unchanged.',
    'Rewrite this paragraph without changing its meaning or numbers.',
    'Do not alter the factual claims in the document.',
  ]) assert.equal(requiresDocumentPreservation(prompt), true, prompt);

  for (const prompt of [
    '润色 docs/notes.md 的标题和英文句子。',
    'Polish this paragraph for clarity.',
    'The document says that facts remain unchanged.',
    'This converter can preserve facts while changing formats.',
    '该函数保持数据含义不变。',
    'Polish docs/notes.md. The phrase ‘facts unchanged’ itself should be rewritten. Only modify docs/notes.md.',
    '润色 docs/notes.md；把“事实不变”这四个字改得更自然。只修改 docs/notes.md。',
    '',
  ]) assert.equal(requiresDocumentPreservation(prompt), false, prompt);
});

test('baseline and evaluation records retain only digests, counts, booleans, and reason codes', () => {
  const oldBaseline = baseline();
  const evidence = evaluate('# Random Notes\n\nThe stable fact remains 42.\n', oldBaseline);
  const serialized = JSON.stringify({ oldBaseline, evidence });

  assert.ok(oldBaseline);
  assert.equal(evidence?.ok, true);
  assert.doesNotMatch(serialized, /The stable fact|Random Notes|docs\/notes\.md/);
  for (const record of [oldBaseline, evidence]) {
    assert.equal('rawText' in record, false);
    assert.equal('oldText' in record, false);
    assert.equal('newText' in record, false);
    assert.equal('targetPath' in record, false);
    assert.equal('tokens' in record, false);
  }
  assert.match(oldBaseline.targetPathDigest, /^[a-f0-9]{64}$/);
  assert.match(oldBaseline.documentDigest, /^[a-f0-9]{64}$/);
  for (const entry of oldBaseline.exactLiterals) {
    assert.match(entry.digest, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(entry.count));
  }
  for (const entry of oldBaseline.coreAnchors) {
    assert.match(entry.digest, /^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(entry.count));
  }
});

test('the observed E2E semantic drift fails on a new lower bound and dropped claim anchors', () => {
  const evidence = evaluate('# Random Notes\n\nAt least 42 is still a constant.\n');

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, true);
  assert.equal(evidence.checks.rangeTerms.ok, false);
  assert.equal(evidence.checks.coreAnchors.ok, false);
  assert.ok(evidence.reasonCodes.includes('range-terms-added'));
  assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
});

test('changed exact literals are rejected even when the surrounding claim words remain', () => {
  const evidence = evaluate('# Notes\n\nThe stable fact remains 43.\n');

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, false);
  assert.equal(evidence.checks.exactLiterals.addedCount, 1);
  assert.equal(evidence.checks.exactLiterals.removedCount, 1);
  assert.ok(evidence.reasonCodes.includes('exact-literal-set-changed'));
});

test('numeric signs, comparators, and temperature units remain part of the exact fact', async (t) => {
  for (const [oldText, newText] of [
    ['The temperature is -42 degrees.', 'The temperature is 42 degrees.'],
    ['The threshold is >42.', 'The threshold is <42.'],
    ['The threshold is =42.', 'The threshold is ≈42.'],
    ['The threshold is ≈42.', 'The threshold is ~42.'],
    ['The result is +42.', 'The result is -42.'],
    ['The temperature is 42 °C.', 'The temperature is 42 °F.'],
    ['温度是42℃。', '温度是42℉。'],
    ['成功率是42%。', '成功率是42‰。'],
    ['The temperature is −42 degrees.', 'The temperature is 42 degrees.'],
  ]) {
    await t.test(`${oldText} -> ${newText}`, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.exactLiterals.ok, false);
      assert.ok(evidence.reasonCodes.includes('exact-literal-set-changed'));
    });
  }
});

test('scientific and non-decimal numeric literals retain their complete values', async (t) => {
  for (const [oldText, newText] of [
    ['The error is 1e-3.', 'The error is 9e-3.'],
    ['The scale is 1E+3.', 'The scale is 9E+3.'],
    ['The threshold is >1e3.', 'The threshold is <1e3.'],
    ['The mask is 0x10.', 'The mask is 0x20.'],
    ['The mask is 0b10.', 'The mask is 0b11.'],
    ['The mask is 0o10.', 'The mask is 0o20.'],
  ]) {
    await t.test(`${oldText} -> ${newText}`, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.exactLiterals.ok, false);
      assert.ok(evidence.reasonCodes.includes('exact-literal-set-changed'));
    });
  }
});

test('numbers with adjacent ASCII units remain exact literals', async (t) => {
  for (const [oldText, newText] of [
    ['The distance is 42km.', 'The distance is 43km.'],
    ['The frequency is 42MHz.', 'The frequency is 43MHz.'],
    ['The width is 42px.', 'The width is 43px.'],
    ['The current is 42A.', 'The current is 43A.'],
  ]) {
    await t.test(`${oldText} -> ${newText}`, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.exactLiterals.ok, false);
    });
  }
});

test('numbers adjacent to Chinese prose and units remain exact literals', async (t) => {
  for (const [oldText, newText] of [
    ['该系统支持42个用户。', '该系统支持43个用户。'],
    ['温度是42℃。', '温度是43℃。'],
    ['成功率是42%。', '成功率是43%。'],
    ['版本为第42版。', '版本为第43版。'],
    ['收入是42万元。', '收入是43万元。'],
  ]) {
    await t.test(`${oldText} -> ${newText}`, () => {
      const oldBaseline = baseline(`# 事实\n\n${oldText}\n`);
      const evidence = evaluate(`# 事实\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.exactLiterals.ok, false);
      assert.ok(evidence.reasonCodes.includes('exact-literal-set-changed'));
    });
  }
});

test('numeric literal spacing is canonicalized without erasing its semantics', () => {
  for (const [oldText, newText] of [
    ['The threshold is > 42.', 'The threshold is >42.'],
    ['The rate is 42 %.', 'The rate is 42%.'],
    ['The temperature is 42 °C.', 'The temperature is 42°C.'],
    ['The scale is 1E+3.', 'The scale is 1e3.'],
    ['The mask is 0XAF.', 'The mask is 0xaf.'],
  ]) {
    const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
    const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
    assert.equal(evidence?.ok, true, `${oldText} -> ${newText}`);
  }
});

test('new polarity, range, and modality terms are rejected independently', async (t) => {
  const cases = [
    ['not', 'The stable fact is not 42.', 'polarityTerms', 'polarity-terms-added'],
    ['false', 'The stable fact is false: 42.', 'polarityTerms', 'polarity-terms-added'],
    ['curly apostrophe contraction', 'The stable fact isn’t 42.', 'polarityTerms', 'polarity-terms-added'],
    ['excludes', 'The stable fact excludes 42.', 'polarityTerms', 'polarity-terms-added'],
    ['approximately', 'The stable fact is approximately 42.', 'rangeTerms', 'range-terms-added'],
    ['at least', 'The stable fact is at least 42.', 'rangeTerms', 'range-terms-added'],
    ['at most', 'The stable fact is at most 42.', 'rangeTerms', 'range-terms-added'],
    ['about', 'The stable fact is about 42.', 'rangeTerms', 'range-terms-added'],
    ['only', 'The only stable fact is 42.', 'rangeTerms', 'range-terms-added'],
    ['may', 'The stable fact may be 42.', 'modalityTerms', 'modality-terms-added'],
    ['might', 'The stable fact might be 42.', 'modalityTerms', 'modality-terms-added'],
    ['could', 'The stable fact could be 42.', 'modalityTerms', 'modality-terms-added'],
  ];

  for (const [name, sentence, check, reason] of cases) {
    await t.test(name, () => {
      const evidence = evaluate(`# Notes\n\n${sentence}\n`);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks[check].ok, false);
      assert.ok(evidence.reasonCodes.includes(reason));
    });
  }
});

test('dropping factual prose anchors is rejected without relying on a qualifier change', () => {
  const evidence = evaluate('# Notes\n\nThe value is 42.\n');

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, true);
  assert.equal(evidence.checks.polarityTerms.ok, true);
  assert.equal(evidence.checks.rangeTerms.ok, true);
  assert.equal(evidence.checks.modalityTerms.ok, true);
  assert.equal(evidence.checks.coreAnchors.ok, false);
  assert.ok(evidence.reasonCodes.includes('core-anchors-added'));
  assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
});

test('removed semantic qualifiers are rejected as well as added ones', () => {
  const qualified = baseline('# Notes\n\nThe stable fact may be approximately 42.\n');
  const evidence = evaluate('# Notes\n\nThe stable fact is 42.\n', qualified);

  assert.equal(evidence?.ok, false);
  assert.ok(evidence.reasonCodes.includes('range-terms-removed'));
  assert.ok(evidence.reasonCodes.includes('modality-terms-removed'));
});

test('Chinese polarity, range, and modality equivalents are rejected', async (t) => {
  const oldBaseline = baseline('# 说明\n\n稳定事实是 42。\n');
  const cases = [
    ['polarity', '稳定事实不是 42。', 'polarityTerms'],
    ['range', '稳定事实至少是 42。', 'rangeTerms'],
    ['approximation', '稳定事实大约是 42。', 'rangeTerms'],
    ['modality', '稳定事实可能是 42。', 'modalityTerms'],
  ];

  for (const [name, sentence, check] of cases) {
    await t.test(name, () => {
      const evidence = evaluate(`# 说明\n\n${sentence}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks[check].ok, false);
    });
  }
});

test('Chinese rejection language cannot preserve a positive support claim', () => {
  const oldBaseline = baseline('# 说明\n\n该系统支持 42 个用户。\n');
  const evidence = evaluate('# 说明\n\n该系统拒绝支持 42 个用户。\n', oldBaseline);

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.polarityTerms.ok, false);
  assert.ok(evidence.reasonCodes.includes('polarity-terms-added'));
});

test('facts moved into HTML comments are treated as dropped, not visible prose', () => {
  const evidence = evaluate('# Notes\n\n<!-- The stable fact is 42. -->\n');

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, false);
  assert.equal(evidence.checks.coreAnchors.ok, false);
  assert.ok(evidence.reasonCodes.includes('exact-literal-set-changed'));
  assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
});

test('facts moved into Markdown reference comments are treated as dropped', () => {
  const evidence = evaluate('# Notes\n\n[//]: # (The stable fact is 42.)\n');

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, false);
  assert.equal(evidence.checks.coreAnchors.ok, false);
});

test('facts moved into Markdown indented code or non-prose HTML containers are dropped', async (t) => {
  for (const [name, text] of [
    ['indented code', '# Notes\n\n    The stable fact is 42.\n'],
    ['script', '# Notes\n\n<script>\nThe stable fact is 42.\n</script>\n'],
    ['style', '# Notes\n\n<style>\nThe stable fact is 42.\n</style>\n'],
    ['template', '# Notes\n\n<template>\nThe stable fact is 42.\n</template>\n'],
    ['hidden div', '# Notes\n\n<div hidden>\nThe stable fact is 42.\n</div>\n'],
    ['hidden details', '# Notes\n\n<details hidden>\nThe stable fact is 42.\n</details>\n'],
    ['preformatted code', '# Notes\n\n<pre>\nThe stable fact is 42.\n</pre>\n'],
  ]) {
    await t.test(name, () => {
      const evidence = evaluate(text);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.exactLiterals.ok, false);
      assert.equal(evidence.checks.coreAnchors.ok, false);
    });
  }
});

test('facts moved into LaTeX comments or inactive blocks are treated as dropped', async (t) => {
  const oldBaseline = baseline('The stable fact is 42.\n', 'main.tex');
  for (const [name, text] of [
    ['percent comment', '% The stable fact is 42.\n'],
    ['iffalse block', '\\iffalse\nThe stable fact is 42.\n\\fi\n'],
    ['comment environment', '\\begin{comment}\nThe stable fact is 42.\n\\end{comment}\n'],
  ]) {
    await t.test(name, () => {
      const evidence = evaluate(text, oldBaseline, 'main.tex');
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.exactLiterals.ok, false);
      assert.equal(evidence.checks.coreAnchors.ok, false);
    });
  }
});

test('literal-to-claim bindings cannot be swapped between subjects', () => {
  const oldBaseline = baseline('# Facts\n\nAlice has 42 apples.\nBob has 7 oranges.\n');
  const evidence = evaluate('# Facts\n\nAlice has 7 apples.\nBob has 42 oranges.\n', oldBaseline);

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, true);
  assert.equal(evidence.checks.coreAnchors.ok, false);
  assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
});

test('subject and object order cannot be reversed while retaining the same words', () => {
  const oldBaseline = baseline('# Facts\n\nAlice defeated Bob 3 times.\n');
  const evidence = evaluate('# Facts\n\nBob defeated Alice 3 times.\n', oldBaseline);

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, true);
  assert.equal(evidence.checks.coreAnchors.ok, false);
  assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
});

test('subject and object order remains bound even when a factual line has no exact literal', async (t) => {
  for (const [oldText, newText] of [
    ['Alice supports Bob.', 'Bob supports Alice.'],
    ['Alice is Bob’s manager.', 'Bob is Alice’s manager.'],
    ['Alice is older than Bob.', 'Bob is older than Alice.'],
  ]) {
    await t.test(oldText, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.coreAnchors.ok, false);
      assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
    });
  }
});

test('all visible prose retains lexical claim anchors without relying on a verb whitelist', async (t) => {
  for (const [oldText, newText] of [
    ['Alice won the race.', 'Bob won the race.'],
    ['甲方击败乙方。', '乙方击败甲方。'],
    ['该方法提高准确率。', '该方法降低准确率。'],
  ]) {
    await t.test(oldText, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.coreAnchors.ok, false);
      assert.ok(evidence.reasonCodes.includes('core-anchors-added'));
      assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
    });
  }
});

test('logical conjunction and disjunction remain claim anchors', async (t) => {
  for (const [oldText, newText] of [
    ['Alice supports Bob and Carol.', 'Alice supports Bob or Carol.'],
    ['The system requires A and B.', 'The system requires A or B.'],
    ['系统支持甲方和乙方。', '系统支持甲方或乙方。'],
    ['系统支持甲方与乙方。', '系统支持甲方或者乙方。'],
  ]) {
    await t.test(oldText, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.coreAnchors.ok, false);
    });
  }
});

test('equative relationship order remains bound when the line also contains a literal', async (t) => {
  for (const [oldText, newText] of [
    ['Alice is older than Bob by 42 days.', 'Bob is older than Alice by 42 days.'],
    ['Alice is Bob’s manager for 3 projects.', 'Bob is Alice’s manager for 3 projects.'],
  ]) {
    await t.test(oldText, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.exactLiterals.ok, true);
      assert.equal(evidence.checks.coreAnchors.ok, false);
      assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
    });
  }
});

test('multiple literals remain ordered within one factual proposition', () => {
  const oldBaseline = baseline('# Facts\n\nAlice has 42 apples and Bob has 7 oranges.\n');
  const evidence = evaluate('# Facts\n\nAlice has 7 apples and Bob has 42 oranges.\n', oldBaseline);

  assert.equal(evidence?.ok, false);
  assert.equal(evidence.checks.exactLiterals.ok, true);
  assert.equal(evidence.checks.coreAnchors.ok, false);
  assert.ok(evidence.reasonCodes.includes('core-anchors-dropped'));
});

test('new factual propositions and additive contradictions are rejected', async (t) => {
  for (const [oldText, newText] of [
    ['Alice supports Bob.', 'Alice supports Bob.\nBob supports Alice.'],
    ['Alice supports Bob.', 'Alice supports Bob.\nBob harms Alice.'],
    ['The stable fact is 42.', 'The stable fact is 42.\nAlice supports Bob.'],
  ]) {
    await t.test(newText, () => {
      const oldBaseline = baseline(`# Facts\n\n${oldText}\n`);
      const evidence = evaluate(`# Facts\n\n${newText}\n`, oldBaseline);
      assert.equal(evidence?.ok, false);
      assert.equal(evidence.checks.proseLines.ok, false);
      assert.equal(evidence.checks.proseLines.addedCount, 1);
      assert.ok(evidence.reasonCodes.includes('prose-lines-added'));
    });
  }
});

test('minimal claim-preserving equivalents and title-only edits pass', () => {
  for (const text of [
    '# Random Notes\n\nThe stable fact remains 42.\n',
    '# Random Notes\n\nThe fact remains stable at 42.\n',
    '# Random Notes\n\nThe stable fact is 42.\n',
  ]) {
    const evidence = evaluate(text);
    assert.equal(evidence?.ok, true, text);
    assert.deepEqual(evidence.reasonCodes, []);
  }
});

test('Markdown headings are excluded from literals, semantic terms, and core anchors', () => {
  const oldBaseline = baseline('# At least 41 Notes\n\nThe stable fact is 42.\n');
  const evidence = evaluate('# Only 99 Notes\n\nThe stable fact is 42.\n', oldBaseline);

  assert.equal(evidence?.ok, true);
  assert.equal(oldBaseline.counts.headingLines, 1);
  assert.equal(oldBaseline.counts.factualLines, 1);
});

test('evidence is target-bound and malformed baselines fail closed', () => {
  const oldBaseline = baseline();
  const wrongTarget = evaluateDocumentPreservation({
    baseline: oldBaseline,
    newText: ORIGINAL,
    targetPath: 'docs/other.md',
  });

  assert.equal(wrongTarget?.ok, false);
  assert.deepEqual(wrongTarget.reasonCodes, ['target-path-mismatch']);
  assert.equal(evaluateDocumentPreservation({ baseline: {}, newText: ORIGINAL, targetPath: TARGET }), null);
  assert.equal(createDocumentPreservationBaseline({ oldText: null, targetPath: TARGET }), null);
  assert.equal(createDocumentPreservationBaseline({ oldText: ORIGINAL, targetPath: '' }), null);
});
