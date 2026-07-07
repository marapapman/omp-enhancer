import { mkdir, open, rename, stat } from 'node:fs/promises';
import path from 'node:path';

const maxBytes = 10 * 1024 * 1024;
const keepFiles = 10;
const filesByKind = {
  routes: 'routes.jsonl',
  gates: 'gates.jsonl',
  loops: 'loops.jsonl',
};

export function isDebugGatesEnabled(env = process.env) {
  return String(env?.OMP_DEBUG_GATES ?? '') === '1';
}

export function debugLogPath({ cwd = process.cwd(), kind = 'routes' } = {}) {
  return path.join(cwd || process.cwd(), '.omp', 'logs', filesByKind[kind] ?? filesByKind.routes);
}

export function buildDebugRecord({ kind, prompt = '', route = null, gateKey = '', reasonCode = '', payload = {} } = {}) {
  return {
    ts: new Date().toISOString(),
    kind,
    prompt: String(prompt ?? ''),
    workflowRoute: route?.workflowRoute ?? null,
    intent: route?.intent ?? null,
    gateKey: gateKey || null,
    reasonCode: reasonCode || null,
    payload,
  };
}

export async function appendDebugLog({ cwd = process.cwd(), kind = 'routes', record = {}, env = process.env } = {}) {
  if (!isDebugGatesEnabled(env)) return { written: false, reason: 'disabled' };
  const file = debugLogPath({ cwd, kind });
  await mkdir(path.dirname(file), { recursive: true });
  await rotateDebugLog(file);
  const handle = await open(file, 'a');
  try {
    await handle.appendFile(`${JSON.stringify(record)}\n`);
  } finally {
    await handle.close();
  }
  return { written: true, file };
}

async function rotateDebugLog(file) {
  let info;
  try {
    info = await stat(file);
  } catch {
    return;
  }
  if (info.size < maxBytes) return;
  for (let index = keepFiles - 1; index >= 1; index -= 1) {
    await safeRename(`${file}.${index}`, `${file}.${index + 1}`);
  }
  await safeRename(file, `${file}.1`);
}

async function safeRename(source, target) {
  try {
    await rename(source, target);
  } catch {
    // Rotation is best-effort; a missing old segment is normal.
  }
}
