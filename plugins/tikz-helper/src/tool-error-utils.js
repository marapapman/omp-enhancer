/**
 * Vendored from omp-enhancer-core/src/small-model-hardening.js
 */

export function actionableParamError({ toolName, field, badValue, expected, example }) {
  const parts = [`Tool "${toolName}" parameter "${field}" rejected.`, `Received: ${describeValue(badValue)}.`, `Expected: ${expected}.`];
  if (example) parts.push(`Correct example: ${example}`);
  return parts.join(' ');
}

export function requireString(toolName, field, value) {
  if (value === null || value === undefined || value === '') return { ok: false, error: actionableParamError({ toolName, field, badValue: value, expected: 'a non-empty string', example: `"${field}": "some-value"` }) };
  if (typeof value !== 'string') return { ok: false, error: actionableParamError({ toolName, field, badValue: value, expected: 'a string', example: `"${field}": "some-value"` }) };
  return { ok: true, value };
}

export function parseJsonParam(toolName, field, value, opts = {}) {
  const { allowEmptyString = false } = opts;
  if (value === null || value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false, error: actionableParamError({ toolName, field, badValue: value, expected: 'a JSON string (use JSON.stringify() to convert your object)', example: `"${field}": ${JSON.stringify(JSON.stringify({ id: 'root' }))}` }) };
  if (value.trim() === '' && !allowEmptyString) return { ok: false, error: actionableParamError({ toolName, field, badValue: value, expected: 'a non-empty JSON string' }) };
  try { return { ok: true, value: JSON.parse(value) }; } catch {
    return { ok: false, error: actionableParamError({ toolName, field, badValue: value.slice(0, 80), expected: 'valid JSON', example: `"${field}": "{\\"id\\":\\"root\\",\\"children\\":[]}"` }) };
  }
}

export function withToolErrorHandling(toolName, handler) {
  return async (toolCallId, params, signal, onUpdate, ctx) => {
    try { return await handler(toolCallId, params, signal, onUpdate, ctx); }
    catch (error) {
      const message = error?.message || String(error);
      const code = error?.code || 'RUNTIME_ERROR';
      return { content: [{ type: 'text', text: `Tool "${toolName}" failed (${code}): ${message}` }], details: { ok: false, code, error: message, ...(error?.details ? { context: error.details } : {}) }, isError: true };
    }
  };
}

export function describeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array (${value.length} items)`;
  if (typeof value === 'object') { const keys = Object.keys(value).slice(0, 5); return `object (keys: ${keys.join(', ') || 'none'})`; }
  if (typeof value === 'string') return `string "${value.slice(0, 60)}"`;
  return `${typeof value} ${value}`;
}
