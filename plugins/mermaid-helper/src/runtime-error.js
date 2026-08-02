export class MermaidRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MermaidRuntimeError';
    this.code = code;
    this.details = details;
  }
}

export function asRuntimeError(error, fallbackCode = 'RUNTIME_ERROR') {
  if (error instanceof MermaidRuntimeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new MermaidRuntimeError(fallbackCode, message);
}
