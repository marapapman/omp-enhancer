import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { resolveLanguage } from './language.js';

export const POLISHER_MODEL_ROLE = 'polisher';
export const POLISHER_ROLE_FALLBACKS = Object.freeze(['@polisher', '@tiny', '@smol']);
export const POLISHER_MAX_INPUT_CHARS = 120_000;

const PROMPT_FILES = Object.freeze({
  en: new URL('../polisher/prompt-en.md', import.meta.url),
  zh: new URL('../polisher/prompt-zh.md', import.meta.url),
});
const promptCache = new Map();

export class PolisherError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PolisherError';
    this.code = code;
    this.details = details;
  }
}

export function createCompletionLoader(override, importer) {
  if (typeof override === 'function') return async () => override;
  return async () => {
    const module = await importer();
    return module.completeSimple;
  };
}

export function loadPolisherPrompt(language) {
  const key = language === 'zh' ? 'zh' : 'en';
  if (!promptCache.has(key)) {
    promptCache.set(key, readFileSync(fileURLToPath(PROMPT_FILES[key]), 'utf8'));
  }
  return promptCache.get(key);
}

function selectorList(modelSelector) {
  const explicit = typeof modelSelector === 'string' && modelSelector.trim() !== '' ? [modelSelector.trim()] : [];
  return [...explicit, ...POLISHER_ROLE_FALLBACKS.filter((selector) => !explicit.includes(selector))];
}

export function resolvePolisherModel(models, modelSelector) {
  if (!models || typeof models.resolve !== 'function') {
    return { ok: false, reason: 'no_model_facade' };
  }
  for (const selector of selectorList(modelSelector)) {
    let model;
    try {
      model = models.resolve(selector);
    } catch {
      model = undefined;
    }
    if (model) return { ok: true, selector, model };
  }
  let current;
  try {
    current = models.current?.();
  } catch {
    current = undefined;
  }
  if (current) return { ok: true, selector: 'session', model: current };
  return { ok: false, reason: 'no_model' };
}

function hasAuthorizationHeader(headers) {
  if (!headers) return false;
  return Object.keys(headers).some((name) => {
    const lower = name.toLowerCase();
    return lower === 'authorization' || lower === 'x-api-key' || lower === 'api-key';
  });
}

async function resolveAuth(modelRegistry, model) {
  if (!modelRegistry || typeof modelRegistry.getApiKeyAndHeaders !== 'function') return {};
  try {
    const resolved = await modelRegistry.getApiKeyAndHeaders(model);
    const headers = resolved?.headers && typeof resolved.headers === 'object' ? resolved.headers : undefined;
    const apiKey = typeof resolved?.apiKey === 'string' && resolved.apiKey !== '' && !hasAuthorizationHeader(headers)
      ? resolved.apiKey
      : undefined;
    return {
      ...(apiKey ? { apiKey } : {}),
      ...(headers ? { headers } : {}),
    };
  } catch {
    return {};
  }
}

function reasoningLevel(model) {
  const efforts = model?.thinking?.efforts;
  if (!Array.isArray(efforts) || efforts.length === 0) return undefined;
  return efforts.includes('low') ? 'low' : efforts[0];
}

function maxOutputTokens(model, textLength) {
  const estimated = Math.ceil(textLength * 1.6) + 512;
  const modelCap = Number.isFinite(model?.maxTokens) && model.maxTokens > 0 ? model.maxTokens : 8192;
  const contextWindow = Number.isFinite(model?.contextWindow) && model.contextWindow > 0 ? model.contextWindow : null;
  const contextCap = contextWindow ? Math.max(256, contextWindow - estimated) : 32768;
  return Math.min(Math.max(estimated, 1024), modelCap, contextCap, 32768);
}

function extractPolishedText(message) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  return blocks
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
}

function stripOuterFence(text) {
  const match = text.match(/^```[^\n]*\n([\s\S]*?)\n```$/u);
  return match ? match[1].trim() : text;
}

export function checkPolisherInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new PolisherError('empty_text', 'polisher received no text to polish.');
  }
  if (text.length > POLISHER_MAX_INPUT_CHARS) {
    throw new PolisherError('text_too_large', `polisher accepts at most ${POLISHER_MAX_INPUT_CHARS} characters per call.`, {
      length: text.length,
    });
  }
  if (/```/u.test(text) || /(?:^|\n)[ \t]*~~~/u.test(text)) {
    throw new PolisherError(
      'code_not_supported',
      'polisher accepts prose only. Remove fenced code blocks and call it once per prose segment; code is never polished.',
    );
  }
}

export async function runPolisher(input = {}, options = {}) {
  const text = typeof input.text === 'string' ? input.text : '';
  try {
    checkPolisherInput(text);
  } catch (error) {
    return { ok: false, code: error.code, report: error.message, details: { error: error.message, ...error.details } };
  }

  const language = resolveLanguage(input.language, text);
  const resolved = resolvePolisherModel(options.models, options.modelSelector);
  if (!resolved.ok) {
    const report = resolved.reason === 'no_model_facade'
      ? 'polisher could not resolve a model: the host exposes no model facade.'
      : 'polisher could not resolve a model: configure modelRoles.polisher or the tiny/smol role.';
    return { ok: false, code: resolved.reason, report, details: { error: report, language } };
  }
  if (typeof options.completeSimple !== 'function') {
    const report = 'polisher could not run: the host model completion API is unavailable.';
    return { ok: false, code: 'no_completion_api', report, details: { error: report, language } };
  }

  const model = resolved.model;
  const systemPrompt = loadPolisherPrompt(language);
  const auth = await resolveAuth(options.modelRegistry, model);
  const reasoning = reasoningLevel(model);
  let message;
  try {
    message = await options.completeSimple(
      model,
      {
        systemPrompt,
        messages: [{ role: 'user', content: text, timestamp: Date.now() }],
      },
      {
        maxTokens: maxOutputTokens(model, text.length),
        ...(reasoning ? { reasoning } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...auth,
      },
    );
  } catch (error) {
    const detail = error?.message ? String(error.message) : String(error);
    return {
      ok: false,
      code: 'model_error',
      report: `polisher model call failed: ${detail}`,
      details: { error: detail, language, selector: resolved.selector, model: model?.id ?? null, provider: model?.provider ?? null },
    };
  }

  if (message?.stopReason === 'error' || message?.stopReason === 'aborted') {
    const detail = message?.errorMessage ?? `stop reason ${message.stopReason}`;
    return {
      ok: false,
      code: message.stopReason === 'aborted' ? 'aborted' : 'model_error',
      report: `polisher model call did not complete: ${detail}`,
      details: { error: detail, language, selector: resolved.selector },
    };
  }

  if (message?.stopReason === 'length') {
    return {
      ok: false,
      code: 'truncated_output',
      report: 'polisher output hit the token limit before the passage was finished. Split the passage and retry.',
      details: { error: 'truncated_output', language, selector: resolved.selector },
    };
  }

  const polished = stripOuterFence(extractPolishedText(message));
  if (polished === '') {
    return {
      ok: false,
      code: 'empty_output',
      report: 'polisher returned no text.',
      details: { error: 'empty_output', language, selector: resolved.selector, stopReason: message?.stopReason ?? null },
    };
  }

  return {
    ok: true,
    text: /\n$/u.test(text) ? `${polished}\n` : polished,
    details: {
      language,
      selector: resolved.selector,
      model: model?.id ?? null,
      provider: model?.provider ?? null,
      inputChars: text.length,
      outputChars: polished.length,
    },
  };
}
