import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { resolvePluginRoot } from './plugin-root.js';

const INSTALL_SCRIPT = path.join('scripts', 'install.sh');
const INSTALL_HINT = "run `npm run setup:deps -w plugins/omp-config` or `bash <plugin>/scripts/install.sh`";

export async function runDependencyCheck(root = process.cwd()) {
  const pluginRoot = await resolvePluginRoot(root);
  const scriptPath = path.join(pluginRoot, INSTALL_SCRIPT);
  const scriptAvailable = await pathExists(scriptPath);
  if (!scriptAvailable) {
    return {
      ok: false,
      platform: process.platform,
      scriptAvailable,
      scriptPath,
      officecli: { present: false, version: null, error: 'install script not found in plugin package' },
      summary: 'install script missing; omp-config Office workflows cannot be validated',
      installHint: INSTALL_HINT,
    };
  }

  const officecli = await probeOfficecli();
  const missing = officecli.present ? [] : ['officecli'];
  return {
    ok: missing.length === 0,
    platform: process.platform,
    scriptAvailable: true,
    scriptPath,
    officecli,
    summary: missing.length === 0
      ? 'all omp-config external dependencies present'
      : `missing external dependencies: ${missing.join(', ')}`,
    missing,
    installHint: INSTALL_HINT,
  };
}

async function probeOfficecli() {
  const bin = process.platform === 'win32' ? 'officecli.exe' : 'officecli';
  try {
    const version = await runCommand(bin, ['--version'], 10_000);
    return { present: true, version, error: null };
  } catch (error) {
    return { present: false, version: null, error: String(error?.message || error) };
  }
}

function runCommand(bin, args, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      rejectPromise(new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise(stdout.trim().split('\n')[0] || '');
      } else {
        rejectPromise(new Error(`${bin} exited with code ${code}`));
      }
    });
  });
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

export function formatDependencyCheckReport(result) {
  const lines = [];
  lines.push(result.ok ? 'Dependency check: OK' : 'Dependency check: INCOMPLETE');
  lines.push(`officecli: ${result.officecli.present ? `present (${result.officecli.version})` : `missing${result.officecli.error ? ` — ${result.officecli.error}` : ''}`}`);
  lines.push(result.summary);
  if (!result.ok) lines.push(`To install: ${result.installHint}`);
  return lines.join('\n');
}
