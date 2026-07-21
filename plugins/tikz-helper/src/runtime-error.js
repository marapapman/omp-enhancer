export class TikzRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TikzRuntimeError';
    this.code = code;
    this.details = details;
  }
}

export function asRuntimeError(error, fallbackCode = 'RUNTIME_ERROR') {
  if (error instanceof TikzRuntimeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new TikzRuntimeError(fallbackCode, message);
}
