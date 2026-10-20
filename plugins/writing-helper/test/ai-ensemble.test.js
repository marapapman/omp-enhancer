import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  AI_ENSEMBLE_NO_SLOW_MARGIN,
  AI_ENSEMBLE_SLOW_MARGIN,
  AI_ENSEMBLE_THRESHOLD,
  AI_ENSEMBLE_WEIGHTS,
  decideAiEnsemble,
  weightedAiScore,
} from '../src/ai-ensemble.js';

describe('AIGC + Jev ensemble policy', () => {
  it('uses the reviewed weights and threshold', () => {
    assert.deepEqual(AI_ENSEMBLE_WEIGHTS, [0.325, 0.675]);
    assert.equal(AI_ENSEMBLE_THRESHOLD, 0.38);
    assert.equal(AI_ENSEMBLE_NO_SLOW_MARGIN, 0);
    assert.equal(AI_ENSEMBLE_SLOW_MARGIN, 0.2);
    assert.equal(Number(weightedAiScore(0.9, 0.8).toFixed(4)), 0.8325);
    assert.equal(Number(weightedAiScore(0.9, 0.8, [1, 1]).toFixed(2)), 0.85);
    assert.equal(decideAiEnsemble({ aigcP: 0.38, jevP: 0.38 }).label, 'ai');
    assert.equal(decideAiEnsemble({ aigcP: 0.1, jevP: 0.1 }).label, 'human');
  });

  it('reports uncertainty and uses a slow label only inside the margin', () => {
    const uncertain = decideAiEnsemble({ aigcP: 0.38, jevP: 0.38, slowLabel: 'human', slowMargin: 0.2 });
    assert.equal(uncertain.label, 'human');
    assert.equal(uncertain.source, 'slow');
    assert.equal(uncertain.uncertain, true);

    const confident = decideAiEnsemble({ aigcP: 0.9, jevP: 0.9, slowLabel: 'human' });
    assert.equal(confident.label, 'ai');
    assert.equal(confident.source, 'weighted');
    assert.equal(confident.uncertain, false);

    const weighted = decideAiEnsemble({ aigcP: 0.38, jevP: 0.38 });
    assert.equal(weighted.label, 'ai');
    assert.equal(weighted.source, 'weighted');
    assert.equal(weighted.uncertain, false);
  });

  it('rejects malformed probabilities, weights, thresholds, margins, and slow labels', () => {
    assert.throws(() => weightedAiScore(1.1, 0.5), /aigcP must be a number in \[0, 1\]/u);
    assert.throws(() => weightedAiScore(0.5, Number.NaN), /jevP must be a number/u);
    assert.throws(() => weightedAiScore(0.5, 0.5, [1]), /weights must contain two/u);
    assert.throws(() => weightedAiScore(0.5, 0.5, [1, -1]), /weights must contain two/u);
    assert.throws(() => weightedAiScore(0.5, 0.5, [0, 0]), /weights must sum/u);
    assert.throws(() => decideAiEnsemble({ aigcP: 0.5, jevP: 0.5, threshold: 2 }), /threshold must be/u);
    assert.throws(() => decideAiEnsemble({ aigcP: 0.5, jevP: 0.5, slowMargin: -1 }), /slowMargin must be/u);
    assert.throws(() => decideAiEnsemble({ aigcP: 0.5, jevP: 0.5, slowLabel: 'maybe' }), /slowLabel must be one of/u);
  });
});
