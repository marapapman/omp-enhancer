export const defaultLoopGuardConfig = {
  maxRepeatedSentence: 3,
  maxRepeatedPhrase: 2,
  maxRepeatedBlock: 2,
  maxRepeatedNgram: 4,
  minRepeatedChars: 30,
  minRepeatedBlockLines: 3,
  maxRepeatedBlockLines: 8,
  minRepeatedBlockChars: 120,
  maxRepeatedBlockFingerprints: 2048,
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
    streamLineCarry: '',
    recentBlockLines: [],
    recentBlockFingerprints: [],
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
  state.streamLineCarry = isString(value.streamLineCarry) ? value.streamLineCarry.slice(-1000) : '';
  state.recentBlockLines = Array.isArray(value.recentBlockLines)
    ? value.recentBlockLines.map(readRepeatedBlockLine).filter(Boolean).slice(-defaultLoopGuardConfig.maxRepeatedBlockLines)
    : [];
  state.recentBlockFingerprints = Array.isArray(value.recentBlockFingerprints)
    ? value.recentBlockFingerprints.filter(isString).slice(-defaultLoopGuardConfig.maxRepeatedBlockFingerprints)
    : [];
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
    streamLineCarry: typeof state.streamLineCarry === 'string' ? state.streamLineCarry.slice(-1000) : '',
    recentBlockLines: Array.isArray(state.recentBlockLines)
      ? state.recentBlockLines.map(readRepeatedBlockLine).filter(Boolean).slice(-defaultLoopGuardConfig.maxRepeatedBlockLines)
      : [],
    recentBlockFingerprints: Array.isArray(state.recentBlockFingerprints)
      ? state.recentBlockFingerprints.filter(isString).slice(-defaultLoopGuardConfig.maxRepeatedBlockFingerprints)
      : [],
  };
}

export function startLoopGuardRun(state = createLoopGuardState(), runId = '') {
  state.currentRunId = String(runId || Date.now());
  state.streamTriggered = false;
  state.lastAbortReason = '';
  state.lastRepeatedText = '';
  resetLoopGuardStreamState(state);
  state.startedAt = Date.now();
  state.lastProgressAt = state.startedAt;
}

export function recordLoopGuardProgress(state = createLoopGuardState(), fingerprint = '') {
  state.lastProgressAt = Date.now();
  resetLoopGuardStreamState(state);
  state.recoveryPending = false;
  state.streamTriggered = false;
  if (fingerprint) {
    state.recentToolFingerprints.push(String(fingerprint));
    state.recentToolFingerprints = state.recentToolFingerprints.slice(-8);
  }
}

export function prepareLoopGuardContinuation(state = createLoopGuardState()) {
  state.streamTriggered = false;
  state.lastProgressAt = Date.now();
  resetLoopGuardStreamState(state);
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

  const block = detectRepeatedBlock(stripped, options);
  if (block) {
    return {
      repeated: true,
      reason: `Repeated ${block.lines}-line block ${block.count} times.`,
      repeatedText: block.text,
      fingerprint: fingerprintGeneratedText(normalized),
      kind: 'block',
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
  let detection = inspectGeneratedText(state.streamBuffer, options);
  if (!detection.repeated) {
    const block = recordRepeatedBlockHistory(state, chunk, options);
    if (block) {
      detection = {
        repeated: true,
        reason: `Repeated ${block.lines}-line block ${block.count} times.`,
        repeatedText: block.text,
        fingerprint: fingerprintGeneratedText(state.streamBuffer),
        kind: 'block',
      };
    }
  }
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

function resetLoopGuardStreamState(state) {
  state.streamBuffer = '';
  state.streamLineCarry = '';
  state.recentBlockLines = [];
  state.recentBlockFingerprints = [];
}

function recordRepeatedBlockHistory(state, chunk, options) {
  ensureRepeatedBlockHistory(state, options);
  const lines = takeCompletedStreamLines(state, chunk, options);
  if (!lines.length) return null;

  for (const original of lines) {
    const fingerprint = repeatedBlockLineFingerprint(original);
    if (!isRepeatedBlockCandidate(fingerprint, options)) continue;

    state.recentBlockLines.push({ original, fingerprint });
    state.recentBlockLines = state.recentBlockLines.slice(-options.maxRepeatedBlockLines);

    const block = detectCurrentBlockRepeat(state, options);
    if (block) return block;
  }

  return null;
}

function ensureRepeatedBlockHistory(state, options) {
  if (!isString(state.streamLineCarry)) state.streamLineCarry = '';
  state.recentBlockLines = Array.isArray(state.recentBlockLines)
    ? state.recentBlockLines.map(readRepeatedBlockLine).filter(Boolean).slice(-options.maxRepeatedBlockLines)
    : [];
  state.recentBlockFingerprints = Array.isArray(state.recentBlockFingerprints)
    ? state.recentBlockFingerprints.filter(isString).slice(-options.maxRepeatedBlockFingerprints)
    : [];
}

function takeCompletedStreamLines(state, chunk, options) {
  const combined = `${state.streamLineCarry || ''}${chunk}`;
  const parts = combined.split(/\r?\n/u);
  if (/[\r\n]$/u.test(combined)) {
    state.streamLineCarry = '';
    if (parts.at(-1) === '') parts.pop();
    return parts;
  }
  if (options.flushIncompleteLine) {
    state.streamLineCarry = '';
    return parts;
  }

  state.streamLineCarry = parts.pop() ?? '';
  return parts;
}

function detectCurrentBlockRepeat(state, options) {
  const minLines = Math.max(2, options.minRepeatedBlockLines);
  const maxLines = Math.max(minLines, options.maxRepeatedBlockLines);
  const repeatedCount = Math.max(2, options.maxRepeatedBlock);

  for (let size = Math.min(maxLines, state.recentBlockLines.length); size >= minLines; size -= 1) {
    const block = state.recentBlockLines.slice(-size);
    const charCount = block.reduce((total, line) => total + line.fingerprint.length, 0);
    if (charCount < options.minRepeatedBlockChars) continue;

    const key = block.map((line) => line.fingerprint).join('\n');
    const digest = digestRepeatedBlockKey(key);
    const previousCount = state.recentBlockFingerprints.includes(digest) ? repeatedCount - 1 : 0;
    if (previousCount + 1 >= repeatedCount) {
      return {
        text: block.map((line) => line.original.trim()).join('\n'),
        count: previousCount + 1,
        lines: size,
      };
    }

    state.recentBlockFingerprints.push(digest);
    state.recentBlockFingerprints = state.recentBlockFingerprints.slice(-options.maxRepeatedBlockFingerprints);
  }

  return null;
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

function detectRepeatedBlock(text, options) {
  const lines = repeatedBlockLines(text, options);
  const minLines = Math.max(2, options.minRepeatedBlockLines);
  const maxLines = Math.max(minLines, options.maxRepeatedBlockLines);
  const repeatedCount = Math.max(2, options.maxRepeatedBlock);

  for (let size = Math.min(maxLines, lines.length); size >= minLines; size -= 1) {
    const seen = new Map();
    for (let start = 0; start <= lines.length - size; start += 1) {
      const block = lines.slice(start, start + size);
      const charCount = block.reduce((total, line) => total + line.fingerprint.length, 0);
      if (charCount < options.minRepeatedBlockChars) continue;

      const key = block.map((line) => line.fingerprint).join('\n');
      const prior = seen.get(key);
      const count = (prior?.count ?? 0) + 1;
      if (count >= repeatedCount) {
        return {
          text: block.map((line) => line.original.trim()).join('\n'),
          count,
          lines: size,
        };
      }
      seen.set(key, { count });
    }
  }

  return null;
}

function repeatedBlockLines(text, options) {
  return String(text ?? '')
    .split(/\r?\n/u)
    .map((line) => ({
      original: line,
      fingerprint: repeatedBlockLineFingerprint(line),
    }))
    .filter((line) => {
      if (!line.fingerprint) return false;
      if (line.fingerprint.length >= options.minRepeatedChars) return true;
      return isMeaningfulSentence(line.fingerprint);
    });
}

function repeatedBlockLineFingerprint(line) {
  return normalizeGeneratedText(line)
    .replace(/^[\s>*-]*(?:\d+[\s.)-]+|[-*]\s+)/u, '')
    .replace(/[^\p{L}\p{N}\u4E00-\u9FFF]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function isRepeatedBlockCandidate(fingerprint, options) {
  if (!fingerprint) return false;
  if (fingerprint.length >= options.minRepeatedChars) return true;
  return isMeaningfulSentence(fingerprint);
}

function digestRepeatedBlockKey(key) {
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619) >>> 0;
    second = ((second << 5) + second + code) >>> 0;
  }
  return `${key.length}:${first.toString(36)}:${second.toString(36)}`;
}

function readRepeatedBlockLine(value) {
  if (!isRecord(value)) return null;
  if (!isString(value.original) || !isString(value.fingerprint)) return null;
  if (!value.fingerprint) return null;
  return {
    original: value.original.slice(-1000),
    fingerprint: value.fingerprint.slice(-1000),
  };
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
