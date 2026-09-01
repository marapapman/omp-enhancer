import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadWritingLogicDocument(input, cwd) {
  if (typeof input.text === 'string') {
    return { ok: true, text: input.text, source: 'text' };
  }

  if (typeof input.path !== 'string' || input.path.trim() === '') {
    return { ok: false, error: 'Either text or path is required.' };
  }

  try {
    const text = readFileSync(resolve(cwd, input.path), 'utf8');
    return { ok: true, text, source: input.path };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Unable to read ${input.path}: ${message}`,
      source: input.path,
    };
  }
}
