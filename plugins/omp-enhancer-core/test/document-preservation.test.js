import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDocumentPreservationBaseline,
  evaluateDocumentPreservation,
  requiresDocumentPreservation,
} from '../src/document-preservation.js';

const TARGET = 'docs/notes.md';
const ORIGINAL = '# Notes\n\nThe stable fact is 42.\n';

function baseline(text = ORIGINAL, targetPath = TARGET, prompt) {
  return createDocumentPreservationBaseline({ oldText: text, targetPath, prompt });
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

test('explicit sentence scope permits one style rewrite while binding heading, literal, and all other text', () => {
  const prompt = 'Polish README.md so the second sentence is concise and direct. Preserve the heading and the exact factual value 42.';
  const original = '# Parser Fixture\n\nThe stable fact is 42. This parser description is kind of rather wordy and could be clearer for readers.\n';
  const scoped = baseline(original, 'README.md', prompt);

  assert.equal(scoped?.scope?.mode, 'explicit-sentence');
  assert.equal(scoped?.scope?.status, 'resolved');
  assert.equal(scoped?.scope?.segmenterVersion, 1);
  assert.deepEqual(scoped?.scope?.editableSentenceOrdinals, [2]);
  const concise = evaluateDocumentPreservation({
    baseline: scoped,
    newText: '# Parser Fixture\n\nThe stable fact is 42. This parser description is unnecessarily wordy.\n',
    targetPath: 'README.md',
  });
  assert.equal(concise?.ok, true);
  assert.equal(concise.checks.modalityTerms.ok, false);
  assert.equal(concise.checks.modalityTerms.applicable, false);
  assert.equal(concise.scopeChecks.immutableScope.ok, true);

  for (const [name, changed] of [
    ['heading', '# Different Fixture\n\nThe stable fact is 42. This parser description is unnecessarily wordy.\n'],
    ['literal', '# Parser Fixture\n\nThe stable fact is 43. This parser description is unnecessarily wordy.\n'],
    ['first sentence', '# Parser Fixture\n\nThe stable value is 42. This parser description is unnecessarily wordy.\n'],
    ['extra sentence', '# Parser Fixture\n\nThe stable fact is 42. This parser description is unnecessarily wordy. Another claim appears.\n'],
  ]) {
    const evidence = evaluateDocumentPreservation({ baseline: scoped, newText: changed, targetPath: 'README.md' });
    assert.equal(evidence?.ok, false, name);
  }
});

test('explicit preservation scope fails closed when the protected literal is ambiguous or editable', () => {
  const prompt = 'Polish README.md so the second sentence is concise. Preserve the heading and the exact factual value 42.';
  const ambiguous = createDocumentPreservationBaseline({
      oldText: '# Notes\n\nThe first value is 42. The second value is also 42.\n',
      targetPath: 'README.md',
      prompt,
    });
  assert.equal(ambiguous?.scope?.status, 'unresolved');
  assert.equal(ambiguous?.scope?.reasonCode, 'protected-literal-ambiguous');
  const editable = createDocumentPreservationBaseline({
      oldText: '# Notes\n\nThe first sentence is plain. The second value is 42.\n',
      targetPath: 'README.md',
      prompt,
    });
  assert.equal(editable?.scope?.status, 'unresolved');
  assert.equal(editable?.scope?.reasonCode, 'protected-literal-in-editable-sentence');
  for (const record of [ambiguous, editable]) {
    const serialized = JSON.stringify(record);
    assert.doesNotMatch(serialized, /The first|The second|README\.md/);
  }

  for (const coordinatedPrompt of [
    'Polish the second and third sentences. Preserve the heading and the exact factual value 42.',
    '润色第二句和第三句。保留标题和精确事实数值 42。',
  ]) {
    const coordinated = baseline(
      '# Notes\n\nThe stable fact is 42. The second sentence is wordy. The third sentence is wordy.\n',
      'README.md',
      coordinatedPrompt,
    );
    assert.equal(coordinated?.scope?.status, 'unresolved', coordinatedPrompt);
    assert.equal(coordinated?.scope?.reasonCode, 'ambiguous-editable-sentence', coordinatedPrompt);
  }
});

test('explicit sentence authorization requires an affirmative edit clause and no residual global preservation', () => {
  const original = '# Notes\n\nThe stable fact is 42. The second metric is 7.\n';
  for (const prompt of [
    'Do not edit the second sentence. Preserve the heading and the exact factual value 42; polish wording elsewhere.',
    'Do not edit the second sentence, polish wording elsewhere. Preserve the heading and the exact factual value 42.',
    'Do not edit the second sentence but polish wording elsewhere. Preserve the heading and the exact factual value 42.',
    'Polish every sentence except the second sentence. Preserve the heading and the exact factual value 42.',
    'Polish all but not the second sentence. Preserve the heading and the exact factual value 42.',
    'Polish all but the second sentence. Preserve the heading and the exact factual value 42.',
    'Make no changes to the second sentence. Preserve the heading and the exact factual value 42.',
    'Make the second sentence remain unchanged. Preserve the heading and the exact factual value 42.',
    "I don't want you to edit the second sentence. Preserve the heading and the exact factual value 42.",
    'Rather than polish the second sentence, polish wording elsewhere. Preserve the heading and the exact factual value 42.',
    'Polish the second sentence. Preserve the heading, the exact factual value 42, and all numbers.',
    'Polish the second sentence. Preserve the heading, the exact factual value 42, and preserve facts.',
    'Polish the second sentence. Preserve the heading and the exact factual value 42. Keep all content unchanged.',
    'Polish the second sentence. Preserve the heading and the exact factual value 42. Everything must remain unchanged.',
    'Polish the second sentence. Preserve the heading and the exact factual value 42. Do not alter any text.',
    '不要修改第二句，润色其他文字。保留标题和精确事实数值 42。',
    '不要修改第二句而润色其他文字。保留标题和精确事实数值 42。',
    '不要对第二句进行修改，只润色其他文字。保留标题和精确事实数值 42。',
    '第二句不要进行修改，只润色其他文字。保留标题和精确事实数值 42。',
    '对第二句不作修改，只润色其他文字。保留标题和精确事实数值 42。',
    '我不希望你修改第二句，只润色其他文字。保留标题和精确事实数值 42。',
    '不要尝试修改第二句，只润色其他文字。保留标题和精确事实数值 42。',
    '润色除第二句以外的文字。保留标题和精确事实数值 42。',
    '润色所有文字，第二句除外。保留标题和精确事实数值 42。',
    '润色第 二 句除外的文字。保留标题和精确事实数值 42。',
    '润色第二句。保留标题和精确事实数值 42，并保留所有数字。',
    '润色第二句。保留标题和精确事实数值 42，并保留事实。',
    '润色第二句。保留标题和精确事实数值 42。其余内容保持不变。',
    '润色第二句。保留标题和精确事实数值 42。不要修改任何文字。',
  ]) {
    const strict = baseline(original, 'README.md', prompt);
    assert.equal(strict?.scope, undefined, prompt);
    const evidence = evaluateDocumentPreservation({
      baseline: strict,
      newText: '# Notes\n\nThe stable fact is 42. The second metric is 8.\n',
      targetPath: 'README.md',
    });
    assert.equal(evidence?.ok, false, prompt);
  }

  for (const prompt of [
    'Make the second sentence concise. Preserve the heading and the exact factual value 42.',
    '对第二句进行润色，使其简洁。保留标题和精确事实数值 42。',
  ]) {
    const scoped = baseline(original, 'README.md', prompt);
    assert.equal(scoped?.scope?.status, 'resolved', prompt);
    assert.deepEqual(scoped.scope.editableSentenceOrdinals, [2], prompt);
  }
});

test('Chinese affirmative sentence scope resolves while preserving its protected value', () => {
  const prompt = '润色 README.md 的第二句，使其简洁直接。保留标题和精确事实数值 42。';
  const original = '# 标题\n\n稳定事实是 42。这个说明非常冗长，需要精简。\n';
  const scoped = baseline(original, 'README.md', prompt);
  assert.equal(scoped?.scope?.status, 'resolved');
  assert.deepEqual(scoped?.scope?.editableSentenceOrdinals, [2]);
  const evidence = evaluateDocumentPreservation({
    baseline: scoped,
    newText: '# 标题\n\n稳定事实是 42。这个说明需要精简。\n',
    targetPath: 'README.md',
  });
  assert.equal(evidence?.ok, true);
});

test('hard-wrapped Markdown is segmented by visible prose blocks instead of physical lines', () => {
  const prompt = 'Polish the second sentence. Preserve the heading and the exact factual value 42.';
  const original = '# Notes\n\nThe stable fact is 42 and remains\ntrue. This prose is kind of rather wordy.\n';
  const scoped = baseline(original, 'README.md', prompt);
  assert.equal(scoped?.scope?.sentenceCount, 2);

  const outsideChange = evaluateDocumentPreservation({
    baseline: scoped,
    newText: '# Notes\n\nThe stable fact is 42 and remains\nfalse. This prose is kind of rather wordy.\n',
    targetPath: 'README.md',
  });
  assert.equal(outsideChange?.ok, false);
  assert.ok(outsideChange.reasonCodes.includes('immutable-scope-changed'));

  const scopedChange = evaluateDocumentPreservation({
    baseline: scoped,
    newText: '# Notes\n\nThe stable fact is 42 and remains\ntrue. This prose is concise.\n',
    targetPath: 'README.md',
  });
  assert.equal(scopedChange?.ok, true);

  const chinese = baseline(
    '# 说明\n\n稳定事实是 42 并且保持\n不变。这个说明十分冗长。\n',
    'README.md',
    '润色第二句。保留标题和精确事实数值 42。',
  );
  assert.equal(chinese?.scope?.sentenceCount, 2);
  const chineseDrift = evaluateDocumentPreservation({
    baseline: chinese,
    newText: '# 说明\n\n稳定事实是 42 并且保持\n变化。这个说明十分冗长。\n',
    targetPath: 'README.md',
  });
  assert.equal(chineseDrift?.ok, false);

  const quote = baseline(
    '# Quote\n\n> The stable fact is 42 and remains\n> true. This quoted prose is rather\n> wordy.\n',
    'README.md',
    prompt,
  );
  assert.equal(quote?.scope?.sentenceCount, 2);
  const quotedOutsideChange = evaluateDocumentPreservation({
    baseline: quote,
    newText: '# Quote\n\n> The stable fact is 42 and remains\n> false. This quoted prose is rather\n> wordy.\n',
    targetPath: 'README.md',
  });
  assert.equal(quotedOutsideChange?.ok, false);
  const quotedContainerEscape = evaluateDocumentPreservation({
    baseline: quote,
    newText: '# Quote\n\n> The stable fact is 42 and remains\n> true. This quoted prose is rather\nwordy.\n',
    targetPath: 'README.md',
  });
  assert.equal(quotedContainerEscape?.ok, false);
  assert.ok(quotedContainerEscape.reasonCodes.includes('immutable-scope-changed'));
  const quotedScopedChange = evaluateDocumentPreservation({
    baseline: quote,
    newText: '# Quote\n\n> The stable fact is 42 and remains\n> true. This quoted prose is concise.\n',
    targetPath: 'README.md',
  });
  assert.equal(quotedScopedChange?.ok, true);

  const canonical = baseline(
    '# Notes\r\n\r\nThe stable fact is 42 and remains\r\ntrue. Cafe\u0301 wording is verbose.\r\n',
    'README.md',
    prompt,
  );
  assert.equal(canonical?.scope?.sentenceCount, 2);
  const canonicalScopedChange = evaluateDocumentPreservation({
    baseline: canonical,
    newText: '# Notes\n\nThe stable fact is 42 and remains\ntrue. Café wording is concise.\n',
    targetPath: 'README.md',
  });
  assert.equal(canonicalScopedChange?.ok, true);
});

test('scoped evidence reports real readback counts instead of synthetic placeholders', () => {
  const prompt = 'Polish the second sentence. Preserve the heading and the exact factual value 42.';
  const original = '# Notes\n\nThe stable fact is 42. This wording could improve.\n';
  const scoped = baseline(original, 'README.md', prompt);
  const evidence = evaluateDocumentPreservation({
    baseline: scoped,
    newText: '# Notes\n\nThe stable fact is 42. Concise wording.\n',
    targetPath: 'README.md',
  });
  const observed = baseline('# Notes\n\nThe stable fact is 42. Concise wording.\n');
  assert.equal(evidence?.ok, true);
  assert.equal(evidence.counts.observedProseLines, observed.counts.proseLines);
  assert.equal(evidence.counts.observedFactualLines, observed.counts.factualLines);
  assert.equal(evidence.counts.observedExactLiterals, observed.counts.exactLiterals);
  assert.equal(evidence.counts.observedCoreAnchors, observed.counts.coreAnchors);
  assert.equal(evidence.checks.modalityTerms.applicable, false);
  assert.equal(evidence.scopeChecks.protectedLiterals.ok, true);
  assert.equal(evidence.scopeChecks.sentenceCount.ok, true);
  assert.equal(evidence.scopeChecks.headingSequence.ok, true);
  assert.equal(evidence.scopeChecks.immutableScope.ok, true);
});

test('broad preserve-all-facts keeps the strict lexical invariant', () => {
  const prompt = 'Polish README.md while preserving all facts and their meaning unchanged.';
  const original = '# Parser Fixture\n\nThe stable fact is 42. This parser description could be clearer for readers.\n';
  const strict = baseline(original, 'README.md', prompt);
  const evidence = evaluateDocumentPreservation({
    baseline: strict,
    newText: '# Parser Fixture\n\nThe stable fact is 42. This parser description is clearer.\n',
    targetPath: 'README.md',
  });

  assert.equal(strict?.scope, undefined);
  assert.equal(evidence?.ok, false);
  assert.ok(evidence.reasonCodes.includes('modality-terms-removed'));
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
  const scoped = baseline(
    '# Notes\n\nThe stable fact is 42. This wording is verbose.\n',
    TARGET,
    'Polish the second sentence. Preserve the heading and the exact factual value 42.',
  );
  assert.equal(evaluateDocumentPreservation({
    baseline: { ...scoped, scope: { ...scoped.scope, segmenterVersion: 2 } },
    newText: '# Notes\n\nThe stable fact is 42. Concise wording.\n',
    targetPath: TARGET,
  }), null);
  assert.equal(evaluateDocumentPreservation({
    baseline: { ...scoped, scope: { ...scoped.scope, contractDigest: '0'.repeat(64) } },
    newText: '# Notes\n\nThe stable fact is 42. Concise wording.\n',
    targetPath: TARGET,
  }), null);
  assert.equal(createDocumentPreservationBaseline({ oldText: null, targetPath: TARGET }), null);
  assert.equal(createDocumentPreservationBaseline({ oldText: ORIGINAL, targetPath: '' }), null);
});
