/**
 * Vendored from omp-enhancer-core/src/small-model-hardening.js
 */

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
