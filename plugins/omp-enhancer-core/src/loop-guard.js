export const defaultLoopGuardConfig = {
  maxRepeatedSentence: 3,
  maxRepeatedPhrase: 2,
  maxRepeatedNgram: 4,
  minRepeatedChars: 30,
  englishNgramSize: 8,
  cjkNgramSize: 16,
  maxBufferChars: 6000,
  maxRecoveryAttempts: 1,
};

export function createLoopGuardState() {
  return {
    enabled: true,
    currentRunId: '',
    repeatedGenerationCount: 0,
    recoveryAttempts: 0,
    recoveryPending: false,
    streamTriggered: false,
    lastAbortReason: '',
    lastRepeatedText: '',
    lastNonRepeatedSummary: '',
    recentOutputFingerprints: [],
    recentToolFingerprints: [],
    startedAt: 0,
    lastProgressAt: 0,
    streamBuffer: '',
  };
}

export function readLoopGuardSnapshot(value) {
  if (!isRecord(value)) return createLoopGuardState();
  const state = createLoopGuardState();
  state.enabled = value.enabled !== false;
  state.currentRunId = isString(value.currentRunId) ? value.currentRunId : '';
  state.repeatedGenerationCount = Number.isInteger(value.repeatedGenerationCount) ? value.repeatedGenerationCount : 0;
  state.recoveryAttempts = Number.isInteger(value.recoveryAttempts) ? value.recoveryAttempts : 0;
  state.recoveryPending = value.recoveryPending === true;
  state.streamTriggered = value.streamTriggered === true;
  state.lastAbortReason = isString(value.lastAbortReason) ? value.lastAbortReason : '';
  state.lastRepeatedText = isString(value.lastRepeatedText) ? value.lastRepeatedText : '';
  state.lastNonRepeatedSummary = isString(value.lastNonRepeatedSummary) ? value.lastNonRepeatedSummary : '';
  state.recentOutputFingerprints = Array.isArray(value.recentOutputFingerprints)
    ? value.recentOutputFingerprints.filter(isString).slice(-8)
    : [];
  state.recentToolFingerprints = Array.isArray(value.recentToolFingerprints)
    ? value.recentToolFingerprints.filter(isString).slice(-8)
    : [];
  state.startedAt = Number.isFinite(value.startedAt) ? value.startedAt : 0;
  state.lastProgressAt = Number.isFinite(value.lastProgressAt) ? value.lastProgressAt : 0;
  state.streamBuffer = isString(value.streamBuffer) ? value.streamBuffer.slice(-defaultLoopGuardConfig.maxBufferChars) : '';
  return state;
}

export function serializeLoopGuardState(state = createLoopGuardState()) {
  return {
    enabled: state.enabled !== false,
    currentRunId: state.currentRunId || '',
    repeatedGenerationCount: Number.isInteger(state.repeatedGenerationCount) ? state.repeatedGenerationCount : 0,
    recoveryAttempts: Number.isInteger(state.recoveryAttempts) ? state.recoveryAttempts : 0,
    recoveryPending: state.recoveryPending === true,
    streamTriggered: state.streamTriggered === true,
    lastAbortReason: state.lastAbortReason || '',
    lastRepeatedText: state.lastRepeatedText || '',
    lastNonRepeatedSummary: state.lastNonRepeatedSummary || '',
    recentOutputFingerprints: Array.isArray(state.recentOutputFingerprints) ? state.recentOutputFingerprints.slice(-8) : [],
    recentToolFingerprints: Array.isArray(state.recentToolFingerprints) ? state.recentToolFingerprints.slice(-8) : [],
    startedAt: Number.isFinite(state.startedAt) ? state.startedAt : 0,
    lastProgressAt: Number.isFinite(state.lastProgressAt) ? state.lastProgressAt : 0,
    streamBuffer: typeof state.streamBuffer === 'string'
      ? state.streamBuffer.slice(-defaultLoopGuardConfig.maxBufferChars)
      : '',
  };
}

export function startLoopGuardRun(state = createLoopGuardState(), runId = '') {
  state.currentRunId = String(runId || Date.now());
  state.streamTriggered = false;
  state.lastAbortReason = '';
  state.lastRepeatedText = '';
  state.streamBuffer = '';
  state.startedAt = Date.now();
  state.lastProgressAt = state.startedAt;
}

export function recordLoopGuardProgress(state = createLoopGuardState(), fingerprint = '') {
  state.lastProgressAt = Date.now();
  state.streamBuffer = '';
  state.recoveryPending = false;
  state.streamTriggered = false;
  if (fingerprint) {
    state.recentToolFingerprints.push(String(fingerprint));
    state.recentToolFingerprints = state.recentToolFingerprints.slice(-8);
  }
}

export function inspectGeneratedText(text = '', config = {}) {
  const options = { ...defaultLoopGuardConfig, ...config };
  const stripped = stripExemptBlocks(text);
  const normalized = normalizeGeneratedText(stripped);
  if (!normalized) return { repeated: false, reason: '', repeatedText: '', fingerprint: '' };

  const sentence = detectRepeatedSentence(normalized, options);
  if (sentence) {
    return {
      repeated: true,
      reason: `Repeated sentence ${sentence.count} times.`,
      repeatedText: sentence.text,
      fingerprint: fingerprintGeneratedText(normalized),
      kind: 'sentence',
    };
  }

  const phrase = detectRepeatedPhrase(stripped, options);
  if (phrase) {
    return {
      repeated: true,
      reason: `Repeated phrase ${phrase.count} times.`,
      repeatedText: phrase.text,
      fingerprint: fingerprintGeneratedText(normalized),
      kind: 'phrase',
    };
  }

  const ngram = detectRepeatedNgram(normalized, options);
  if (ngram) {
    return {
      repeated: true,
      reason: `Repeated ${ngram.size}-gram ${ngram.count} times.`,
      repeatedText: ngram.text,
      fingerprint: fingerprintGeneratedText(normalized),
      kind: 'ngram',
    };
  }

  return {
    repeated: false,
    reason: '',
    repeatedText: '',
    fingerprint: fingerprintGeneratedText(normalized),
  };
}

export function recordGeneratedText(state = createLoopGuardState(), text = '', config = {}) {
  if (state.enabled === false) return { repeated: false, reason: '', repeatedText: '' };
  const options = { ...defaultLoopGuardConfig, ...config };
  const chunk = String(text ?? '');
  if (!chunk.trim()) return { repeated: false, reason: '', repeatedText: '' };

  state.streamBuffer = `${state.streamBuffer || ''}${chunk}`.slice(-options.maxBufferChars);
  const detection = inspectGeneratedText(state.streamBuffer, options);
  if (!detection.repeated) {
    state.lastNonRepeatedSummary = summarizeNonRepeatedText(state.streamBuffer);
    if (detection.fingerprint) {
      state.recentOutputFingerprints.push(detection.fingerprint);
      state.recentOutputFingerprints = state.recentOutputFingerprints.slice(-8);
    }
    return detection;
  }

  state.repeatedGenerationCount += 1;
  state.recoveryPending = true;
  state.streamTriggered = true;
  state.lastAbortReason = detection.reason;
  state.lastRepeatedText = detection.repeatedText;
  if (!state.lastNonRepeatedSummary) state.lastNonRepeatedSummary = summarizeNonRepeatedText(state.streamBuffer);
  if (detection.fingerprint) {
    state.recentOutputFingerprints.push(detection.fingerprint);
    state.recentOutputFingerprints = state.recentOutputFingerprints.slice(-8);
  }
  return detection;
}

export function takeLoopRecoveryContext(state = createLoopGuardState(), config = {}) {
  const options = { ...defaultLoopGuardConfig, ...config };
  if (!state.recoveryPending) return null;
  if (state.recoveryAttempts >= options.maxRecoveryAttempts) return null;
  state.recoveryAttempts += 1;
  state.recoveryPending = false;
  return buildLoopRecoveryContext(state);
}

export function buildLoopRecoveryContext(state = createLoopGuardState()) {
  const repeated = state.lastRepeatedText
    ? `Stopped repeated text: ${truncateLine(state.lastRepeatedText, 220)}`
    : null;
  const reason = state.lastAbortReason || 'Repeated generation was detected.';
  const lastGood = state.lastNonRepeatedSummary
    ? `Last non-repeated context summary: ${truncateLine(state.lastNonRepeatedSummary, 360)}`
    : null;

  return [
    'OMP Enhancer Core main-agent loop guard stopped the previous generation because it was repeating itself.',
    `Reason: ${reason}`,
    repeated,
    lastGood,
    'Recovery rule: continue from the last non-repeated state and choose exactly one next action:',
    '1. call the next required tool,',
    '2. provide the final answer, or',
    '3. report BLOCKERS with the exact missing evidence.',
    'Do not repeat the stopped sentence or rephrase the same validation request.',
  ].filter(Boolean).join('\n');
}

export function loopGuardPromptSection() {
  return [
    '### Main Agent Loop Guard',
    '',
    'You are the main/default agent running under MiMo v2.5 unless the user changes the model.',
    'Do not repeat the same sentence, validation request, plan, or blocker.',
    'If you notice you are restating the same idea, stop and choose exactly one: call the next required tool, produce the final answer, or report BLOCKERS.',
    'Never continue an internal thought loop by rephrasing the same sentence. If no new evidence or action is available, stop instead of repeating.',
  ].join('\n');
}

export function normalizeGeneratedText(text = '') {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/gu, '')
    .replace(/[ \t\r\f\v]+/gu, ' ')
    .replace(/\n{2,}/gu, '\n')
    .trim()
    .toLowerCase();
}

export function stripExemptBlocks(text = '') {
  const withoutCode = String(text ?? '').replace(/```[\s\S]*?```/gu, '\n');
  const lines = withoutCode.split(/\r?\n/u);
  const kept = [];
  let skippingUsage = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(SKILL_USAGE|SUBAGENT_USAGE)\s*:?\s*$/iu.test(trimmed)) {
      skippingUsage = true;
      continue;
    }
    if (skippingUsage) {
      if (!trimmed) {
        skippingUsage = false;
      }
      continue;
    }
    if (isTableLine(trimmed)) continue;
    kept.push(line);
  }

  return kept.join('\n');
}

export function fingerprintGeneratedText(text = '') {
  const normalized = normalizeGeneratedText(text)
    .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return normalized.slice(-240);
}

function detectRepeatedSentence(text, options) {
  const sentences = splitSentences(text)
    .map((sentence) => sentenceFingerprint(sentence))
    .filter(isMeaningfulSentence);
  let previous = '';
  let count = 0;
  for (const sentence of sentences) {
    if (sentence === previous) count += 1;
    else {
      previous = sentence;
      count = 1;
    }
    if (count >= options.maxRepeatedSentence) return { text: sentence, count };
  }
  return null;
}

function detectRepeatedPhrase(text, options) {
  const phrases = String(text ?? '')
    .split(/\r?\n/u)
    .map((line) => normalizeGeneratedText(line).replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, ' ').trim())
    .filter((line) => line.length >= options.minRepeatedChars && !isTableLine(line));
  let previous = '';
  let count = 0;
  for (const phrase of phrases) {
    if (phrase === previous) count += 1;
    else {
      previous = phrase;
      count = 1;
    }
    if (count >= options.maxRepeatedPhrase) return { text: phrase, count };
  }
  return null;
}

function detectRepeatedNgram(text, options) {
  const cjk = (text.match(/[\u4E00-\u9FFF]/gu) ?? []).length;
  const latinWords = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (cjk > latinWords.length * 2) return detectRepeatedCjkNgram(text, options);
  return detectRepeatedWordNgram(latinWords.map((word) => word.toLowerCase()), options);
}

function detectRepeatedWordNgram(words, options) {
  const size = options.englishNgramSize;
  if (words.length < size) return null;
  const counts = new Map();
  for (let i = 0; i <= words.length - size; i += 1) {
    const value = words.slice(i, i + size).join(' ');
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count >= options.maxRepeatedNgram) return { text: value, count, size };
  }
  return null;
}

function detectRepeatedCjkNgram(text, options) {
  const chars = text.replace(/[^\u4E00-\u9FFF]/gu, '');
  const size = options.cjkNgramSize;
  if (chars.length < size) return null;
  const counts = new Map();
  for (let i = 0; i <= chars.length - size; i += 1) {
    const value = chars.slice(i, i + size);
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count >= options.maxRepeatedNgram) return { text: value, count, size };
  }
  return null;
}

function splitSentences(text) {
  return String(text ?? '')
    .replace(/([。！？!?])/gu, '$1\n')
    .replace(/([.?!])\s+/gu, '$1\n')
    .split(/\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceFingerprint(sentence) {
  return normalizeGeneratedText(sentence)
    .replace(/^[\s\-*>\d.)]+/u, '')
    .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function isMeaningfulSentence(sentence) {
  if (!sentence) return false;
  const cjk = (sentence.match(/[\u4E00-\u9FFF]/gu) ?? []).length;
  if (cjk >= 8) return true;
  const words = sentence.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 4 || sentence.length >= 24;
}

function isTableLine(line) {
  return /^\|.*\|$/u.test(line) || /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/u.test(line);
}

function summarizeNonRepeatedText(text = '') {
  const stripped = stripExemptBlocks(text);
  const normalized = normalizeGeneratedText(stripped);
  if (!normalized) return '';
  const sentences = splitSentences(normalized).filter((sentence) => !inspectGeneratedText(sentence).repeated);
  const summary = sentences.slice(-3).join(' ');
  return (summary || normalized).slice(-500);
}

function truncateLine(text = '', limit = 240) {
  const value = normalizeGeneratedText(text).replace(/\n+/gu, ' ');
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string';
}
