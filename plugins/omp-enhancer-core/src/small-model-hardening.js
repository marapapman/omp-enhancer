/**
 * Small-model tool-calling hardening utilities.
 *
 * Canonical source. Other plugins vendor the functions they need into their
 * own src/tool-error-utils.js to respect the no-cross-plugin-dependency rule.
 *
 * Error-message format follows Anthropic + Fission-GRPO evidence:
 * field name + bad value + expected format + corrected example.
 */

/**
 * Build a model-actionable error message for a malformed tool parameter.
 * @param {object} opts
 * @param {string} opts.toolName — e.g. 'mermaid_render'
 * @param {string} opts.field — e.g. 'source'
 * @param {unknown} opts.badValue — what the model actually passed
 * @param {string} opts.expected — human description of the expected type/format
 * @param {string} [opts.example] — a corrected example value or call snippet
 * @returns {string} the error message text
 */
export function actionableParamError({ toolName, field, badValue, expected, example }) {
  const parts = [
    `Tool "${toolName}" parameter "${field}" rejected.`,
    `Received: ${describeValue(badValue)}.`,
    `Expected: ${expected}.`,
  ];
  if (example) parts.push(`Correct example: ${example}`);
  return parts.join(' ');
}

/**
 * Validate that a parameter is a non-empty string.
 * @param {string} toolName
 * @param {string} field
 * @param {unknown} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function requireString(toolName, field, value) {
  if (value === null || value === undefined || value === '') {
    return {
      ok: false,
      error: actionableParamError({
        toolName, field, badValue: value,
        expected: 'a non-empty string',
        example: `"${field}": "some-value"`,
      }),
    };
  }
  if (typeof value !== 'string') {
    return {
      ok: false,
      error: actionableParamError({
        toolName, field, badValue: value,
        expected: 'a string',
        example: `"${field}": "some-value"`,
      }),
    };
  }
  return { ok: true, value };
}

/**
 * Parse a JSON-string parameter with a model-actionable error on failure.
 * Handles the common small-model mistake of passing an object instead of JSON.stringify(object).
 * @param {string} toolName
 * @param {string} field
 * @param {unknown} value
 * @param {object} [opts]
 * @param {boolean} [opts.allowEmptyString=false]
 * @returns {{ ok: true, value: object|undefined } | { ok: false, error: string }}
 */
export function parseJsonParam(toolName, field, value, opts = {}) {
  const { allowEmptyString = false } = opts;
  if (value === null || value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'string') {
    return {
      ok: false,
      error: actionableParamError({
        toolName, field, badValue: value,
        expected: 'a JSON string (use JSON.stringify() to convert your object)',
        example: `"${field}": ${JSON.stringify(JSON.stringify({ id: 'root' }))}`,
      }),
    };
  }
  if (value.trim() === '') {
    if (allowEmptyString) {
      return { ok: true, value: '' };
    }
    return {
      ok: false,
      error: actionableParamError({
        toolName, field, badValue: value,
        expected: 'a non-empty JSON string',
      }),
    };
  }
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return {
      ok: false,
      error: actionableParamError({
        toolName, field, badValue: value.slice(0, 80),
        expected: 'valid JSON',
        example: `"${field}": "{\\"id\\":\\"root\\",\\"children\\":[]}"`,
      }),
    };
  }
}

/**
 * Wrap an execute handler with model-actionable error catching.
 * @param {string} toolName
 * @param {Function} handler
 * @returns {Function} wrapped handler
 */
export function withToolErrorHandling(toolName, handler) {
  return async (toolCallId, params, signal, onUpdate, ctx) => {
    try {
      return await handler(toolCallId, params, signal, onUpdate, ctx);
    } catch (error) {
      const message = error?.message || String(error);
      const code = error?.code || 'RUNTIME_ERROR';
      return {
        content: [{ type: 'text', text: `Tool "${toolName}" failed (${code}): ${message}` }],
        details: { ok: false, code, error: message, ...(error?.details ? { context: error.details } : {}) },
        isError: true,
      };
    }
  };
}

/**
 * Human-readable description of a value for error messages.
 * @param {unknown} value
 * @returns {string}
 */
export function describeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `array (${value.length} items)`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).slice(0, 5);
    return `object (keys: ${keys.join(', ') || 'none'})`;
  }
  if (typeof value === 'string') return `string "${value.slice(0, 60)}"`;
  return `${typeof value} ${value}`;
}
