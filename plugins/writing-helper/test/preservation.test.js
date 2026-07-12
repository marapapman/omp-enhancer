import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  compareSemanticPreservation,
  extractSemanticAnchors,
} from '../src/preservation.js';

describe('semantic preservation comparator', () => {
  it('accepts formatting-only changes while retaining stable semantic anchors', () => {
    const original = 'Results typically improve by 12.5% and may take at least 2 ms [@smith2024]. See \\ref{sec:results} and $x + 1$.';
    const revised = 'Results may typically improve by 12.5%; they take at least 2 ms [@smith2024]. See \\ref{sec:results} and $x + 1$.';

    const result = compareSemanticPreservation(original, revised, { language: 'en' });

    assert.equal(result.compared, true);
    assert.equal(result.driftDetected, false);
    assert.deepEqual(result.findings, []);
    assert.equal(result.originalAnchorCount > 0, true);
    assert.equal(result.preservedAnchorCount, result.originalAnchorCount);
  });

  it('reports removed and added English qualifiers, polarity, numbers, citations, and LaTeX anchors', () => {
    const original = 'The method typically may improve accuracy by 12.5% and is not slower \\cite{smith2024}; see \\ref{sec:results} and $x+1$.';
    const revised = 'The method always improves accuracy by 14% and is slower; see \\ref{sec:new}.';

    const result = compareSemanticPreservation(original, revised, { language: 'en' });
    const categories = new Set(result.findings.map((finding) => finding.anchorCategory));

    assert.equal(result.driftDetected, true);
    assert.equal(categories.has('qualifier'), true);
    assert.equal(categories.has('modality'), true);
    assert.equal(categories.has('negation'), true);
    assert.equal(categories.has('number'), true);
    assert.equal(categories.has('citation'), true);
    assert.equal(categories.has('latex'), true);
    assert.equal(result.findings.some((finding) => finding.change === 'added'), true);
    assert.equal(result.findings.some((finding) => finding.change === 'removed'), true);
    assert.equal(result.findings.every((finding) => finding.category === 'preservation'), true);
    assert.match(result.findings[0].suggestion, /Confirm/);
  });

  it('reports Chinese qualifier, modality, intensity, scope, direction, causality, and numeric drift', () => {
    const original = '该方法通常可能显著提升准确率至 83.1%，因此延迟至少降低 2 ms，并且不高于 5 ms。';
    const revised = '该方法提升准确率至 90%，延迟为 3 ms。';

    const result = compareSemanticPreservation(original, revised, { language: 'zh' });
    const categories = new Set(result.findings.map((finding) => finding.anchorCategory));

    for (const category of ['qualifier', 'modality', 'intensity', 'scope', 'direction', 'causal', 'negation', 'number']) {
      assert.equal(categories.has(category), true, `expected ${category} drift`);
    }
    assert.match(result.findings[0].suggestion, /确认/);
  });

  it('normalizes duplicate anchors and handles empty input', () => {
    assert.deepEqual(extractSemanticAnchors(), []);
    assert.deepEqual(extractSemanticAnchors(null), []);

    const anchors = extractSemanticAnchors('Typically, typically, the value is 10%.');
    const qualifier = anchors.find((anchor) => anchor.category === 'qualifier');
    assert.equal(qualifier.value, 'typically');
    assert.equal(qualifier.count, 2);

    const numericValues = extractSemanticAnchors('12.5% 2 ms 5倍 2024年')
      .filter((anchor) => anchor.category === 'number')
      .map((anchor) => anchor.value);
    assert.deepEqual(numericValues, ['12.5%', '2 ms', '5倍', '2024年']);

    const unitDrift = compareSemanticPreservation('Accuracy is 12.5%.', 'Accuracy is 12.5.');
    assert.equal(unitDrift.driftDetected, true);

    const result = compareSemanticPreservation('', 'plain text');
    assert.equal(result.driftDetected, false);
    assert.equal(result.originalAnchorCount, 0);
    assert.equal(result.revisedAnchorCount, 0);

    const defaultLanguage = compareSemanticPreservation('typically', 'plain text');
    assert.match(defaultLanguage.findings[0].suggestion, /Confirm/);
  });
});
