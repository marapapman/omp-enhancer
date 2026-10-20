export const AI_ENSEMBLE_WEIGHTS = Object.freeze([0.325, 0.675]);
export const AI_ENSEMBLE_THRESHOLD = 0.38;
export const AI_ENSEMBLE_NO_SLOW_MARGIN = 0;
export const AI_ENSEMBLE_SLOW_MARGIN = 0.2;
export const AI_ENSEMBLE_LABELS = Object.freeze(['human', 'ai']);

function probability(name, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new TypeError(`${name} must be a number in [0, 1], got ${value}`);
  }
  return number;
}

function normalizeWeights(weights) {
  if (!Array.isArray(weights) || weights.length !== 2 || weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new TypeError('weights must contain two non-negative numbers');
  }
  const total = weights[0] + weights[1];
  if (total <= 0) throw new TypeError('weights must sum to a positive number');
  return [weights[0] / total, weights[1] / total];
}

export function weightedAiScore(aigcP, jevP, weights = AI_ENSEMBLE_WEIGHTS) {
  const [aigc, jev] = normalizeWeights(weights);
  return probability('aigcP', aigcP) * aigc + probability('jevP', jevP) * jev;
}

export function decideAiEnsemble({
  aigcP,
  jevP,
  slowLabel = null,
  weights = AI_ENSEMBLE_WEIGHTS,
  threshold = AI_ENSEMBLE_THRESHOLD,
  slowMargin = AI_ENSEMBLE_NO_SLOW_MARGIN,
} = {}) {
  const normalizedThreshold = probability('threshold', threshold);
  if (!Number.isFinite(slowMargin) || slowMargin < 0) {
    throw new TypeError('slowMargin must be a non-negative number');
  }
  if (slowLabel !== null && !AI_ENSEMBLE_LABELS.includes(slowLabel)) {
    throw new TypeError(`slowLabel must be one of ${AI_ENSEMBLE_LABELS.join(', ')}`);
  }
  const score = weightedAiScore(aigcP, jevP, weights);
  const distance = Math.abs(score - normalizedThreshold);
  const uncertain = distance < slowMargin;
  if (slowLabel !== null && uncertain) {
    return {
      label: slowLabel,
      score: Number(score.toFixed(6)),
      source: 'slow',
      uncertain: true,
      distance: Number(distance.toFixed(6)),
      threshold: normalizedThreshold,
      weights: normalizeWeights(weights),
    };
  }
  return {
    label: score >= normalizedThreshold ? 'ai' : 'human',
    score: Number(score.toFixed(6)),
    source: 'weighted',
    uncertain,
    distance: Number(distance.toFixed(6)),
    threshold: normalizedThreshold,
    weights: normalizeWeights(weights),
  };
}
